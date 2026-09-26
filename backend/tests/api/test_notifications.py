"""Avisos in-app (fase 3b, ver 0019)."""

import uuid
from types import SimpleNamespace

from sqlalchemy import text


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


async def _avisos_de(api: SimpleNamespace, user_id: str) -> list[dict]:
    rows = (
        (
            await api.session.execute(
                text(
                    "SELECT type, title, body, read_at FROM notifications "
                    "WHERE user_id = :u AND deleted_at IS NULL ORDER BY created_at"
                ),
                {"u": user_id},
            )
        )
        .mappings()
        .all()
    )
    return [dict(r) for r in rows]


async def test_agregar_miembro_avisa(api: SimpleNamespace) -> None:
    _, otro = await _grupo_con_miembro(api)
    avisos = await _avisos_de(api, otro)
    assert any(a["type"] == "miembro_agregado" for a in avisos)


async def test_pago_real_avisa_al_acreedor(api: SimpleNamespace) -> None:
    gid, otro = await _grupo_con_miembro(api)
    acc = (
        await api.client.post(
            "/api/v1/accounts",
            json={"id": str(uuid.uuid4()), "name": "Cta", "type": "cash", "currency": "ARS"},
        )
    ).json()["id"]
    await api.client.post(
        "/api/v1/settlements",
        json={
            "id": str(uuid.uuid4()),
            "group_id": gid,
            "from_user_id": str(api.owner_id),
            "to_user_id": otro,
            "amount": 20000,
            "currency": "ARS",
            "occurred_at": "2026-09-26T12:00:00-03:00",
            "account_id": acc,
        },
    )
    avisos = await _avisos_de(api, otro)
    assert any(a["type"] == "pago_recibido" for a in avisos)


async def test_marcar_saldado_no_avisa(api: SimpleNamespace) -> None:
    gid, otro = await _grupo_con_miembro(api)
    # limpiar el aviso de "miembro_agregado" no hace falta: filtramos por tipo.
    await api.client.post(
        "/api/v1/settlements",
        json={
            "id": str(uuid.uuid4()),
            "group_id": gid,
            "from_user_id": str(api.owner_id),
            "to_user_id": otro,
            "amount": 20000,
            "currency": "ARS",
            "occurred_at": "2026-09-26T12:00:00-03:00",
        },
    )
    avisos = await _avisos_de(api, otro)
    assert not any(a["type"] == "pago_recibido" for a in avisos)


async def test_marcar_leida(api: SimpleNamespace) -> None:
    # El owner (api) se agrega a un grupo propio ya es owner; para tener un aviso
    # propio, lo insertamos directo.
    nid = str(uuid.uuid4())
    await api.session.execute(
        text(
            "INSERT INTO notifications (id, user_id, type, title, body) "
            "VALUES (:id, :u, 'test', 'Hola', 'Cuerpo')"
        ),
        {"id": nid, "u": api.owner_id},
    )
    await api.session.flush()
    r = await api.client.patch(f"/api/v1/notifications/{nid}", json={})
    assert r.status_code == 200, r.text
    assert r.json()["read_at"] is not None


async def test_marcar_todas_leidas(api: SimpleNamespace) -> None:
    for _ in range(2):
        await api.session.execute(
            text(
                "INSERT INTO notifications (id, user_id, type, title, body) "
                "VALUES (:id, :u, 'test', 'T', 'B')"
            ),
            {"id": str(uuid.uuid4()), "u": api.owner_id},
        )
    await api.session.flush()
    r = await api.client.post("/api/v1/notifications/read-all")
    assert r.status_code == 204
    avisos = await _avisos_de(api, str(api.owner_id))
    assert all(a["read_at"] is not None for a in avisos)
