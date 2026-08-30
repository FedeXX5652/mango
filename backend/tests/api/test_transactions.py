"""API de transacciones (Inc 6): los 3 tipos y su validacion de dominio."""

import uuid
from types import SimpleNamespace

from sqlalchemy import text

OCCURRED = "2026-08-30T12:00:00-03:00"


async def _account(api: SimpleNamespace, currency: str = "ARS") -> str:
    resp = await api.client.post(
        "/api/v1/accounts",
        json={"id": str(uuid.uuid4()), "name": "Cuenta", "type": "cash", "currency": currency},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


async def _category(api: SimpleNamespace, kind: str = "expense") -> str:
    resp = await api.client.post(
        "/api/v1/categories",
        json={"id": str(uuid.uuid4()), "name": f"Cat {kind}", "kind": kind},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def _tx(**over) -> dict:
    base = {
        "id": str(uuid.uuid4()),
        "kind": "expense",
        "occurred_at": OCCURRED,
        "amount": 230272,
        "currency": "ARS",
    }
    base.update(over)
    return base


# --- Alta valida de los tres tipos ------------------------------------------


async def test_create_expense(api: SimpleNamespace) -> None:
    acc = await _account(api)
    cat = await _category(api, "expense")
    resp = await api.client.post(
        "/api/v1/transactions", json=_tx(account_id=acc, category_id=cat, payee="SUBE")
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["status"] == "confirmed"
    assert body["source"] == "manual"
    assert body["amount"] == 230272
    assert body["payee"] == "SUBE"


async def test_create_income(api: SimpleNamespace) -> None:
    acc = await _account(api)
    cat = await _category(api, "income")
    resp = await api.client.post(
        "/api/v1/transactions",
        json=_tx(kind="income", account_id=acc, category_id=cat),
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["kind"] == "income"


async def test_create_transfer(api: SimpleNamespace) -> None:
    origin = await _account(api)
    dest = await _account(api)
    resp = await api.client.post(
        "/api/v1/transactions",
        json=_tx(kind="transfer", account_id=origin, transfer_account_id=dest),
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["transfer_account_id"] == dest
    assert body["category_id"] is None


# --- Reglas de dominio ------------------------------------------------------


async def test_expense_requires_category(api: SimpleNamespace) -> None:
    acc = await _account(api)
    resp = await api.client.post("/api/v1/transactions", json=_tx(account_id=acc))
    assert resp.status_code == 422
    assert "categoria" in resp.json()["detail"].lower()


async def test_expense_rejects_income_category(api: SimpleNamespace) -> None:
    acc = await _account(api)
    cat = await _category(api, "income")
    resp = await api.client.post("/api/v1/transactions", json=_tx(account_id=acc, category_id=cat))
    assert resp.status_code == 422
    assert "tipo expense" in resp.json()["detail"]


async def test_transfer_needs_destination(api: SimpleNamespace) -> None:
    origin = await _account(api)
    resp = await api.client.post(
        "/api/v1/transactions", json=_tx(kind="transfer", account_id=origin)
    )
    assert resp.status_code == 422
    assert "destino" in resp.json()["detail"]


async def test_transfer_accounts_must_differ(api: SimpleNamespace) -> None:
    acc = await _account(api)
    resp = await api.client.post(
        "/api/v1/transactions",
        json=_tx(kind="transfer", account_id=acc, transfer_account_id=acc),
    )
    assert resp.status_code == 422
    assert "distintas" in resp.json()["detail"]


async def test_transfer_rejects_category(api: SimpleNamespace) -> None:
    origin = await _account(api)
    dest = await _account(api)
    cat = await _category(api, "expense")
    resp = await api.client.post(
        "/api/v1/transactions",
        json=_tx(kind="transfer", account_id=origin, transfer_account_id=dest, category_id=cat),
    )
    assert resp.status_code == 422
    assert "transferencia no lleva categoria" in resp.json()["detail"]


async def test_negative_amount_rejected(api: SimpleNamespace) -> None:
    acc = await _account(api)
    cat = await _category(api)
    resp = await api.client.post(
        "/api/v1/transactions", json=_tx(account_id=acc, category_id=cat, amount=-1)
    )
    assert resp.status_code == 422  # lo corta Pydantic (ge=0)


async def test_account_must_exist(api: SimpleNamespace) -> None:
    cat = await _category(api)
    resp = await api.client.post(
        "/api/v1/transactions", json=_tx(account_id=str(uuid.uuid4()), category_id=cat)
    )
    assert resp.status_code == 422
    assert "cuenta no existe" in resp.json()["detail"].lower()


async def test_manual_cannot_force_pending(api: SimpleNamespace) -> None:
    # Enviar status/source en el payload no tiene efecto: la carga manual
    # siempre queda confirmed/manual (regla 4).
    acc = await _account(api)
    cat = await _category(api)
    resp = await api.client.post(
        "/api/v1/transactions",
        json=_tx(account_id=acc, category_id=cat, status="pending", source="email_import"),
    )
    assert resp.status_code == 201
    assert resp.json()["status"] == "confirmed"
    assert resp.json()["source"] == "manual"


async def test_big_amount_keeps_precision(api: SimpleNamespace) -> None:
    big = 9_000_000_000_000_000
    acc = await _account(api)
    cat = await _category(api)
    resp = await api.client.post(
        "/api/v1/transactions", json=_tx(account_id=acc, category_id=cat, amount=big)
    )
    assert resp.status_code == 201
    assert resp.json()["amount"] == big


# --- Aislamiento, edicion, borrado ------------------------------------------


async def test_other_users_transaction_is_404(api: SimpleNamespace) -> None:
    other_user = uuid.uuid4()
    other_acc = uuid.uuid4()
    other_tx = uuid.uuid4()
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
    await api.session.execute(
        text(
            "INSERT INTO transactions "
            "(id, owner_id, kind, status, occurred_at, amount, currency, source, account_id) "
            "VALUES (:id, :owner, 'income', 'confirmed', now(), 100, 'ARS', 'manual', :acc)"
        ),
        {"id": other_tx, "owner": other_user, "acc": other_acc},
    )
    await api.session.flush()
    assert (await api.client.get(f"/api/v1/transactions/{other_tx}")).status_code == 404


async def test_update_amount_and_payee(api: SimpleNamespace) -> None:
    acc = await _account(api)
    cat = await _category(api)
    created = (
        await api.client.post("/api/v1/transactions", json=_tx(account_id=acc, category_id=cat))
    ).json()
    resp = await api.client.patch(
        f"/api/v1/transactions/{created['id']}", json={"amount": 500, "payee": "Kiosco"}
    )
    assert resp.status_code == 200
    assert resp.json()["amount"] == 500
    assert resp.json()["payee"] == "Kiosco"


async def test_update_to_income_category_rejected(api: SimpleNamespace) -> None:
    acc = await _account(api)
    exp = await _category(api, "expense")
    inc = await _category(api, "income")
    created = (
        await api.client.post("/api/v1/transactions", json=_tx(account_id=acc, category_id=exp))
    ).json()
    resp = await api.client.patch(
        f"/api/v1/transactions/{created['id']}", json={"category_id": inc}
    )
    assert resp.status_code == 422


async def test_soft_delete_hides(api: SimpleNamespace) -> None:
    acc = await _account(api)
    cat = await _category(api)
    created = (
        await api.client.post("/api/v1/transactions", json=_tx(account_id=acc, category_id=cat))
    ).json()
    assert (await api.client.delete(f"/api/v1/transactions/{created['id']}")).status_code == 204
    assert (await api.client.get(f"/api/v1/transactions/{created['id']}")).status_code == 404


# --- Listado con filtros ----------------------------------------------------


async def test_list_filters_by_kind_and_account(api: SimpleNamespace) -> None:
    origin = await _account(api)
    dest = await _account(api)
    cat = await _category(api)
    await api.client.post("/api/v1/transactions", json=_tx(account_id=origin, category_id=cat))
    await api.client.post(
        "/api/v1/transactions",
        json=_tx(kind="transfer", account_id=origin, transfer_account_id=dest),
    )

    only_expense = (await api.client.get("/api/v1/transactions", params={"kind": "expense"})).json()
    assert all(t["kind"] == "expense" for t in only_expense)

    # Filtrar por la cuenta destino trae la transferencia (origen o destino).
    by_dest = (await api.client.get("/api/v1/transactions", params={"account_id": dest})).json()
    assert len(by_dest) == 1
    assert by_dest[0]["kind"] == "transfer"
