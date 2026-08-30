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

    got = await api.client.get(f"/api/v1/accounts/{payload['id']}")
    assert got.status_code == 200
    assert got.json()["opening_balance"] == 150000


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
    got = await api.client.get(f"/api/v1/accounts/{resp.json()['id']}")
    assert got.json()["opening_balance"] == big


async def test_other_users_account_is_404(api: SimpleNamespace) -> None:
    # Cuenta de otro usuario: no debe verse (404, no 403).
    other_user = uuid.uuid4()
    other_acc = uuid.uuid4()
    await api.session.execute(
        text(
            "INSERT INTO users (id, email, password_hash, display_name) "
            "VALUES (:id, :email, 'x', 'Otro')"
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

    resp = await api.client.get(f"/api/v1/accounts/{other_acc}")
    assert resp.status_code == 404


async def test_update_account(api: SimpleNamespace) -> None:
    created = (await api.client.post("/api/v1/accounts", json=_payload())).json()
    resp = await api.client.patch(
        f"/api/v1/accounts/{created['id']}", json={"name": "Renombrada", "archived": True}
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["name"] == "Renombrada"
    assert body["archived"] is True


async def test_soft_delete_hides_from_list_and_get(api: SimpleNamespace) -> None:
    created = (await api.client.post("/api/v1/accounts", json=_payload())).json()
    acc_id = created["id"]

    resp = await api.client.delete(f"/api/v1/accounts/{acc_id}")
    assert resp.status_code == 204

    # No aparece mas por GET ni en la lista, pero sigue en la base (borrado logico).
    assert (await api.client.get(f"/api/v1/accounts/{acc_id}")).status_code == 404
    listed = (await api.client.get("/api/v1/accounts")).json()
    assert acc_id not in [a["id"] for a in listed]

    row = (
        await api.session.execute(
            text("SELECT deleted_at FROM accounts WHERE id = :id"), {"id": acc_id}
        )
    ).scalar_one()
    assert row is not None


async def test_archived_hidden_unless_requested(api: SimpleNamespace) -> None:
    created = (await api.client.post("/api/v1/accounts", json=_payload())).json()
    await api.client.patch(f"/api/v1/accounts/{created['id']}", json={"archived": True})

    default_list = (await api.client.get("/api/v1/accounts")).json()
    assert created["id"] not in [a["id"] for a in default_list]

    with_archived = (
        await api.client.get("/api/v1/accounts", params={"include_archived": "true"})
    ).json()
    assert created["id"] in [a["id"] for a in with_archived]


async def test_list_only_returns_current_user(api: SimpleNamespace) -> None:
    await api.client.post("/api/v1/accounts", json=_payload(name="Mia"))
    listed = (await api.client.get("/api/v1/accounts")).json()
    assert [a["name"] for a in listed] == ["Mia"]  # solo lo del usuario de la prueba
