"""API de cuentas (Inc 3)."""

import uuid
from types import SimpleNamespace

from sqlalchemy import text


def _payload(**over) -> dict:
    base = {
        "id": str(uuid.uuid4()),
        "name": "Caja de ahorro",
        "type": "savings",
        "currency": "ARS",
        "opening_balance": 150000,
    }
    base.update(over)
    return base


async def test_create_and_read_back(api: SimpleNamespace) -> None:
    payload = _payload()
    resp = await api.client.post("/api/v1/accounts", json=payload)
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["id"] == payload["id"]
    assert body["name"] == "Caja de ahorro"
    assert body["currency"] == "ARS"
    assert body["archived"] is False

    guardada = await api.fila("accounts", payload["id"])
    assert guardada["opening_balance"] == 150000


async def test_client_id_is_respected(api: SimpleNamespace) -> None:
    # El id lo pone el cliente (decision 5.1): el servidor no lo reasigna.
    fixed = str(uuid.uuid4())
    resp = await api.client.post("/api/v1/accounts", json=_payload(id=fixed))
    assert resp.status_code == 201
    assert resp.json()["id"] == fixed


async def test_currency_normalized_uppercase(api: SimpleNamespace) -> None:
    resp = await api.client.post("/api/v1/accounts", json=_payload(currency="ars"))
    assert resp.status_code == 201
    assert resp.json()["currency"] == "ARS"


async def test_invalid_type_rejected(api: SimpleNamespace) -> None:
    resp = await api.client.post("/api/v1/accounts", json=_payload(type="no_existe"))
    assert resp.status_code == 422


async def test_big_opening_balance_keeps_precision(api: SimpleNamespace) -> None:
    big = 9_000_000_000_000_000
    resp = await api.client.post("/api/v1/accounts", json=_payload(opening_balance=big))
    assert resp.status_code == 201
    assert resp.json()["opening_balance"] == big
    guardada = await api.fila("accounts", resp.json()["id"])
    assert guardada["opening_balance"] == big


async def test_other_users_account_is_404(api: SimpleNamespace) -> None:
    # Cuenta de otro usuario: no se puede tocar, y contesta 404 y no 403 para no
    # revelar que existe. Se prueba con PATCH porque los GET ya no estan: el
    # cliente lee de su propio SQLite.
    other_user = uuid.uuid4()
    other_acc = uuid.uuid4()
    await api.session.execute(
        text(
            "INSERT INTO users (id, username, email, password_hash, display_name) "
            "VALUES (:id, :email, :email, 'x', 'Otro')"
        ),
        {"id": other_user, "email": f"{other_user}@test.local"},
    )
    await api.session.execute(
        text(
            "INSERT INTO accounts (id, owner_id, name, type, currency) "
            "VALUES (:id, :owner, 'Ajena', 'cash', 'ARS')"
        ),
        {"id": other_acc, "owner": other_user},
    )
    await api.session.flush()

    resp = await api.client.patch(f"/api/v1/accounts/{other_acc}", json={"name": "Mia"})
    assert resp.status_code == 404
    assert (await api.client.delete(f"/api/v1/accounts/{other_acc}")).status_code == 404


async def test_update_account(api: SimpleNamespace) -> None:
    created = (await api.client.post("/api/v1/accounts", json=_payload())).json()
    resp = await api.client.patch(
        f"/api/v1/accounts/{created['id']}", json={"name": "Renombrada", "archived": True}
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["name"] == "Renombrada"
    assert body["archived"] is True


async def test_soft_delete_marca_deleted_at(api: SimpleNamespace) -> None:
    created = (await api.client.post("/api/v1/accounts", json=_payload())).json()
    acc_id = created["id"]

    resp = await api.client.delete(f"/api/v1/accounts/{acc_id}")
    assert resp.status_code == 204

    # Sigue en la base con deleted_at (borrado logico, regla 3) y la API ya no
    # la deja tocar: un segundo borrado no la encuentra.
    fila = await api.fila("accounts", acc_id)
    assert fila["deleted_at"] is not None
    assert (await api.client.delete(f"/api/v1/accounts/{acc_id}")).status_code == 404


async def test_duplicate_id_returns_409(api: SimpleNamespace) -> None:
    # Un reintento de subida de PowerSync con el mismo id no es un 500: es 409
    # (ya aplicado), asi el cliente no reintenta en loop.
    payload = _payload()
    assert (await api.client.post("/api/v1/accounts", json=payload)).status_code == 201
    assert (await api.client.post("/api/v1/accounts", json=payload)).status_code == 409


# --- Cuenta conjunta del grupo (fase 3b, ver 0016) ---------------------------


async def test_cuenta_conjunta_de_grupo(api: SimpleNamespace) -> None:
    gid = str(uuid.uuid4())
    assert (
        await api.client.post("/api/v1/groups", json={"id": gid, "name": "Casa"})
    ).status_code == 201
    resp = await api.client.post("/api/v1/accounts", json=_payload(group_id=gid, name="Caja comun"))
    assert resp.status_code == 201, resp.text
    assert resp.json()["group_id"] == gid
    # Es del grupo: sin dueno personal.
    fila = await api.fila("accounts", resp.json()["id"])
    assert fila["owner_id"] is None


async def test_cuenta_conjunta_grupo_ajeno_se_rechaza(api: SimpleNamespace) -> None:
    resp = await api.client.post("/api/v1/accounts", json=_payload(group_id=str(uuid.uuid4())))
    assert resp.status_code == 422
    assert "grupo no existe" in resp.json()["detail"]


async def test_gasto_desde_cuenta_conjunta_marca_paid_from_group(api: SimpleNamespace) -> None:
    gid = str(uuid.uuid4())
    assert (
        await api.client.post("/api/v1/groups", json={"id": gid, "name": "Casa"})
    ).status_code == 201
    acc = (
        await api.client.post("/api/v1/accounts", json=_payload(group_id=gid, name="Caja comun"))
    ).json()["id"]
    cat = (
        await api.client.post(
            "/api/v1/categories",
            json={"id": str(uuid.uuid4()), "name": "Super", "kind": "expense", "group_id": gid},
        )
    ).json()["id"]
    tx = await api.client.post(
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
    assert tx.status_code == 201, tx.text
    fila = await api.fila("transactions", tx.json()["id"])
    assert fila["paid_from_group"] is True


async def test_fondear_cuenta_conjunta_con_transferencia(api: SimpleNamespace) -> None:
    gid = str(uuid.uuid4())
    assert (
        await api.client.post("/api/v1/groups", json={"id": gid, "name": "Casa"})
    ).status_code == 201
    personal = (await api.client.post("/api/v1/accounts", json=_payload(name="Mia"))).json()["id"]
    conjunta = (
        await api.client.post("/api/v1/accounts", json=_payload(group_id=gid, name="Comun"))
    ).json()["id"]
    r = await api.client.post(
        "/api/v1/transactions",
        json={
            "id": str(uuid.uuid4()),
            "kind": "transfer",
            "occurred_at": "2026-09-01T12:00:00-03:00",
            "amount": 500000,
            "currency": "ARS",
            "account_id": personal,
            "transfer_account_id": conjunta,
        },
    )
    assert r.status_code == 201, r.text
