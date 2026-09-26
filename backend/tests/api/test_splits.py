"""Partes de un gasto compartido (fase 3b.3, ver 0015)."""

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


async def _cuenta(api: SimpleNamespace) -> str:
    r = await api.client.post(
        "/api/v1/accounts",
        json={"id": str(uuid.uuid4()), "name": "Cuenta", "type": "cash", "currency": "ARS"},
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def _grupo_con_miembro(api: SimpleNamespace) -> tuple[str, str]:
    """Grupo con el owner (api) y un segundo miembro. Devuelve (group_id, miembro_id)."""
    gid = str(uuid.uuid4())
    assert (
        await api.client.post("/api/v1/groups", json={"id": gid, "name": "Casa"})
    ).status_code == 201
    otro = await _otro_usuario(api, "pareja")
    assert (
        await api.client.post(f"/api/v1/groups/{gid}/members", json={"username": "pareja"})
    ).status_code == 201
    return gid, otro


async def _cat_grupo(api: SimpleNamespace, gid: str) -> str:
    r = await api.client.post(
        "/api/v1/categories",
        json={"id": str(uuid.uuid4()), "name": "Super", "kind": "expense", "group_id": gid},
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def _gasto_compartido(api: SimpleNamespace, gid: str) -> str:
    acc = await _cuenta(api)
    cat = await _cat_grupo(api, gid)
    r = await api.client.post(
        "/api/v1/transactions",
        json={
            "id": str(uuid.uuid4()),
            "kind": "expense",
            "occurred_at": "2026-09-01T12:00:00-03:00",
            "amount": 10000,
            "currency": "ARS",
            "account_id": acc,
            "category_id": cat,
            "visibility": "shared",
            "group_id": gid,
        },
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def test_crear_split_en_gasto_propio_compartido(api: SimpleNamespace) -> None:
    gid, otro = await _grupo_con_miembro(api)
    tx = await _gasto_compartido(api, gid)
    r = await api.client.post(
        "/api/v1/transaction-splits",
        json={"id": str(uuid.uuid4()), "transaction_id": tx, "user_id": otro, "amount": 3000},
    )
    assert r.status_code == 201, r.text
    assert r.json()["amount"] == 3000


async def test_split_para_no_miembro_se_rechaza(api: SimpleNamespace) -> None:
    gid, _ = await _grupo_con_miembro(api)
    tx = await _gasto_compartido(api, gid)
    ajeno = await _otro_usuario(api, "ajeno")
    r = await api.client.post(
        "/api/v1/transaction-splits",
        json={"id": str(uuid.uuid4()), "transaction_id": tx, "user_id": ajeno, "amount": 3000},
    )
    assert r.status_code == 422
    assert "miembro" in r.json()["detail"]


async def test_split_en_movimiento_privado_se_rechaza(api: SimpleNamespace) -> None:
    acc = await _cuenta(api)
    r = await api.client.post(
        "/api/v1/categories",
        json={"id": str(uuid.uuid4()), "name": "Personal", "kind": "expense"},
    )
    cat = r.json()["id"]
    creada = await api.client.post(
        "/api/v1/transactions",
        json={
            "id": str(uuid.uuid4()),
            "kind": "expense",
            "occurred_at": "2026-09-01T12:00:00-03:00",
            "amount": 10000,
            "currency": "ARS",
            "account_id": acc,
            "category_id": cat,
        },
    )
    tx = creada.json()["id"]
    r = await api.client.post(
        "/api/v1/transaction-splits",
        json={
            "id": str(uuid.uuid4()),
            "transaction_id": tx,
            "user_id": str(api.owner_id),
            "amount": 5000,
        },
    )
    assert r.status_code == 422
    assert "compartido no existe" in r.json()["detail"]


async def test_borrar_split(api: SimpleNamespace) -> None:
    gid, otro = await _grupo_con_miembro(api)
    tx = await _gasto_compartido(api, gid)
    sid = str(uuid.uuid4())
    await api.client.post(
        "/api/v1/transaction-splits",
        json={"id": sid, "transaction_id": tx, "user_id": otro, "amount": 3000},
    )
    assert (await api.client.delete(f"/api/v1/transaction-splits/{sid}")).status_code == 204
    assert (await api.fila("transaction_splits", sid))["deleted_at"] is not None
