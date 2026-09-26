"""Pagos entre miembros para saldar (fase 3b.3, ver 0015)."""

import uuid
from types import SimpleNamespace

from sqlalchemy import text

OCCURRED = "2026-09-25T12:00:00-03:00"


async def _otro_usuario(api: SimpleNamespace, username: str) -> str:
    uid = str(uuid.uuid4())
    await api.session.execute(
        text(
            "INSERT INTO users (id, username, email, password_hash, display_name) "
            "VALUES (:id, :u, :e, '!', :u)"
        ),
        {"id": uid, "u": username, "e": f"{uid}@test.local"},
    )
    await api.session.flush()
    return uid


async def _grupo_con_miembro(api: SimpleNamespace) -> tuple[str, str]:
    gid = str(uuid.uuid4())
    assert (
        await api.client.post("/api/v1/groups", json={"id": gid, "name": "Casa"})
    ).status_code == 201
    otro = await _otro_usuario(api, "pareja")
    assert (
        await api.client.post(f"/api/v1/groups/{gid}/members", json={"username": "pareja"})
    ).status_code == 201
    return gid, otro


def _pago(gid: str, de: str, a: str, **over) -> dict:
    base = {
        "id": str(uuid.uuid4()),
        "group_id": gid,
        "from_user_id": de,
        "to_user_id": a,
        "amount": 20000,
        "currency": "ARS",
        "occurred_at": OCCURRED,
    }
    base.update(over)
    return base


async def test_registrar_pago(api: SimpleNamespace) -> None:
    gid, otro = await _grupo_con_miembro(api)
    r = await api.client.post("/api/v1/settlements", json=_pago(gid, otro, str(api.owner_id)))
    assert r.status_code == 201, r.text
    assert r.json()["amount"] == 20000
    assert r.json()["created_by"] == str(api.owner_id)


async def test_pago_entre_la_misma_persona_se_rechaza(api: SimpleNamespace) -> None:
    gid, _ = await _grupo_con_miembro(api)
    r = await api.client.post(
        "/api/v1/settlements", json=_pago(gid, str(api.owner_id), str(api.owner_id))
    )
    assert r.status_code == 422
    assert "distintas" in r.json()["detail"]


async def test_pago_con_no_miembro_se_rechaza(api: SimpleNamespace) -> None:
    gid, _ = await _grupo_con_miembro(api)
    ajeno = await _otro_usuario(api, "ajeno")
    r = await api.client.post("/api/v1/settlements", json=_pago(gid, str(api.owner_id), ajeno))
    assert r.status_code == 422
    assert "miembro" in r.json()["detail"]


async def test_pago_en_grupo_ajeno_se_rechaza(api: SimpleNamespace) -> None:
    # El usuario no es miembro de este grupo (inventado): se trata como inexistente.
    r = await api.client.post(
        "/api/v1/settlements",
        json=_pago(str(uuid.uuid4()), str(api.owner_id), str(uuid.uuid4())),
    )
    assert r.status_code == 422
    assert "grupo no existe" in r.json()["detail"]


async def test_deshacer_pago(api: SimpleNamespace) -> None:
    gid, otro = await _grupo_con_miembro(api)
    pid = str(uuid.uuid4())
    await api.client.post("/api/v1/settlements", json=_pago(gid, otro, str(api.owner_id), id=pid))
    assert (await api.client.delete(f"/api/v1/settlements/{pid}")).status_code == 204
    assert (await api.fila("settlements", pid))["deleted_at"] is not None


# --- Pago real: sale de la cuenta del que paga (fase 3b.3, ver 0017) ----------


async def _cuenta(api: SimpleNamespace, owner_id: str | None = None) -> str:
    if owner_id is None:
        r = await api.client.post(
            "/api/v1/accounts",
            json={"id": str(uuid.uuid4()), "name": "Cta", "type": "cash", "currency": "ARS"},
        )
        assert r.status_code == 201, r.text
        return r.json()["id"]
    aid = str(uuid.uuid4())
    await api.session.execute(
        text(
            "INSERT INTO accounts (id, owner_id, name, type, currency) "
            "VALUES (:id, :o, 'Cta', 'cash', 'ARS')"
        ),
        {"id": aid, "o": owner_id},
    )
    await api.session.flush()
    return aid


async def test_pago_real_desde_mi_cuenta(api: SimpleNamespace) -> None:
    gid, otro = await _grupo_con_miembro(api)
    acc = await _cuenta(api)
    r = await api.client.post(
        "/api/v1/settlements",
        json=_pago(gid, str(api.owner_id), otro, account_id=acc),
    )
    assert r.status_code == 201, r.text
    assert r.json()["account_id"] == acc


async def test_pago_real_con_cuenta_ajena_se_rechaza(api: SimpleNamespace) -> None:
    gid, otro = await _grupo_con_miembro(api)
    acc_otro = await _cuenta(api, owner_id=otro)
    r = await api.client.post(
        "/api/v1/settlements",
        json=_pago(gid, str(api.owner_id), otro, account_id=acc_otro),
    )
    assert r.status_code == 422
    assert "no es del que paga" in r.json()["detail"]


# --- Cobro automatico al acreedor (fase 3b, ver 0018) -------------------------


async def _cobro_de(api: SimpleNamespace, settlement_id: str) -> dict | None:
    row = (
        (
            await api.session.execute(
                text(
                    "SELECT id, owner_id, kind, status, amount, payee FROM transactions "
                    "WHERE settlement_id = :s AND deleted_at IS NULL"
                ),
                {"s": settlement_id},
            )
        )
        .mappings()
        .first()
    )
    return dict(row) if row else None


async def test_pago_real_crea_cobro_pendiente_al_acreedor(api: SimpleNamespace) -> None:
    gid, otro = await _grupo_con_miembro(api)
    acc = await _cuenta(api)
    pid = str(uuid.uuid4())
    r = await api.client.post(
        "/api/v1/settlements",
        json=_pago(gid, str(api.owner_id), otro, account_id=acc, id=pid),
    )
    assert r.status_code == 201, r.text
    cobro = await _cobro_de(api, pid)
    assert cobro is not None
    assert str(cobro["owner_id"]) == otro  # es del ACREEDOR
    assert cobro["kind"] == "income"
    assert cobro["status"] == "pending"
    assert cobro["amount"] == 20000
    assert "Pago de" in cobro["payee"]


async def test_marcar_saldado_no_crea_cobro(api: SimpleNamespace) -> None:
    # Sin cuenta (marcar saldado) no mueve plata: no hay cobro.
    gid, otro = await _grupo_con_miembro(api)
    pid = str(uuid.uuid4())
    await api.client.post("/api/v1/settlements", json=_pago(gid, str(api.owner_id), otro, id=pid))
    assert await _cobro_de(api, pid) is None


async def test_deshacer_pago_borra_cobro_si_pendiente(api: SimpleNamespace) -> None:
    gid, otro = await _grupo_con_miembro(api)
    acc = await _cuenta(api)
    pid = str(uuid.uuid4())
    await api.client.post(
        "/api/v1/settlements",
        json=_pago(gid, str(api.owner_id), otro, account_id=acc, id=pid),
    )
    assert await _cobro_de(api, pid) is not None
    assert (await api.client.delete(f"/api/v1/settlements/{pid}")).status_code == 204
    assert await _cobro_de(api, pid) is None
