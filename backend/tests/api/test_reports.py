"""Saldos y estadisticas (Inc 7). Aritmetica entera, ramifica por kind."""

import uuid
from types import SimpleNamespace

from sqlalchemy import text

AUG = "2026-08-15T12:00:00-03:00"


async def _account(api: SimpleNamespace, opening: int = 0, off_budget: bool = False) -> str:
    resp = await api.client.post(
        "/api/v1/accounts",
        json={
            "id": str(uuid.uuid4()),
            "name": "Cuenta",
            "type": "cash",
            "currency": "ARS",
            "opening_balance": opening,
            "off_budget": off_budget,
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


async def _category(api: SimpleNamespace, kind: str = "expense") -> str:
    resp = await api.client.post(
        "/api/v1/categories",
        json={"id": str(uuid.uuid4()), "name": f"Cat {kind}", "kind": kind},
    )
    return resp.json()["id"]


async def _tx(api: SimpleNamespace, **fields) -> None:
    payload = {"id": str(uuid.uuid4()), "occurred_at": AUG, "currency": "ARS", **fields}
    resp = await api.client.post("/api/v1/transactions", json=payload)
    assert resp.status_code == 201, resp.text


async def test_account_balances_and_net_worth(api: SimpleNamespace) -> None:
    a = await _account(api, opening=100000)
    b = await _account(api, opening=0)
    exp_cat = await _category(api, "expense")
    inc_cat = await _category(api, "income")

    await _tx(api, kind="expense", amount=30000, account_id=a, category_id=exp_cat)
    await _tx(api, kind="income", amount=50000, account_id=a, category_id=inc_cat)
    await _tx(api, kind="transfer", amount=20000, account_id=a, transfer_account_id=b)

    data = (await api.client.get("/api/v1/reports/balances")).json()
    balances = {row["account_id"]: row["balance"] for row in data["accounts"]}
    # A = 100000 + 50000 - 30000 - 20000(salida) = 100000
    assert balances[a] == 100000
    # B = 0 + 20000(entrada) = 20000
    assert balances[b] == 20000

    net = {n["currency"]: n["total"] for n in data["net_worth"]}
    assert net["ARS"] == 120000


async def test_off_budget_excluded_from_net_worth(api: SimpleNamespace) -> None:
    await _account(api, opening=100000)
    off = await _account(api, opening=999999, off_budget=True)

    data = (await api.client.get("/api/v1/reports/balances")).json()
    # La cuenta off_budget aparece en la lista...
    assert any(r["account_id"] == off for r in data["accounts"])
    # ...pero no suma al patrimonio.
    net = {n["currency"]: n["total"] for n in data["net_worth"]}
    assert net["ARS"] == 100000


async def test_pending_does_not_affect_balance(api: SimpleNamespace) -> None:
    a = await _account(api, opening=0)
    inc_cat = await _category(api, "income")
    await _tx(api, kind="income", amount=1000, account_id=a, category_id=inc_cat)

    # Un pending (que solo produce la ingesta automatica) no debe sumar al saldo
    # hasta confirmarse (3.9). Se inserta directo: la API manual no crea pending.
    await api.session.execute(
        text(
            "INSERT INTO transactions "
            "(id, owner_id, kind, status, occurred_at, amount, currency, source, "
            " account_id, category_id, pending_reason) "
            "VALUES (:id, :owner, 'income', 'pending', now(), 5000, 'ARS', 'email_import', "
            " :acc, :cat, 'no_category')"
        ),
        {
            "id": uuid.uuid4(),
            "owner": api.owner_id,  # el usuario de la prueba, para que el pending le pertenezca
            "acc": a,
            "cat": inc_cat,
        },
    )
    await api.session.flush()

    data = (await api.client.get("/api/v1/reports/balances")).json()
    balances = {row["account_id"]: row["balance"] for row in data["accounts"]}
    assert balances[a] == 1000  # el pending de 5000 no cuenta


async def test_totals_by_category(api: SimpleNamespace) -> None:
    a = await _account(api)
    cat1 = await _category(api, "expense")
    cat2 = await _category(api, "expense")
    await _tx(api, kind="expense", amount=1000, account_id=a, category_id=cat1)
    await _tx(api, kind="expense", amount=2500, account_id=a, category_id=cat1)
    await _tx(api, kind="expense", amount=400, account_id=a, category_id=cat2)

    rows = (await api.client.get("/api/v1/reports/by-category")).json()
    totals = {r["category_id"]: r["total"] for r in rows}
    assert totals[cat1] == 3500
    assert totals[cat2] == 400
    # ordenado de mayor a menor
    assert rows[0]["category_id"] == cat1


async def test_monthly_evolution(api: SimpleNamespace) -> None:
    a = await _account(api)
    exp_cat = await _category(api, "expense")
    inc_cat = await _category(api, "income")
    await _tx(api, kind="income", amount=50000, account_id=a, category_id=inc_cat)
    await _tx(api, kind="expense", amount=30000, account_id=a, category_id=exp_cat)
    # una transferencia no debe contar en la evolucion
    b = await _account(api)
    await _tx(api, kind="transfer", amount=9999, account_id=a, transfer_account_id=b)

    rows = (await api.client.get("/api/v1/reports/monthly")).json()
    aug = [r for r in rows if r["month"] == "2026-08-01"]
    assert len(aug) == 1
    assert aug[0]["income"] == 50000
    assert aug[0]["expense"] == 30000
    assert aug[0]["net"] == 20000


async def test_month_boundary_uses_user_timezone(api: SimpleNamespace) -> None:
    # 23:50 del 31/08 en -03:00 = 02:50 UTC del 01/09. Con la zona del usuario
    # debe caer en agosto, no en septiembre (especificacion 8).
    a = await _account(api)
    inc_cat = await _category(api, "income")
    await _tx(
        api,
        kind="income",
        amount=100,
        account_id=a,
        category_id=inc_cat,
        occurred_at="2026-08-31T23:50:00-03:00",
    )
    rows = (await api.client.get("/api/v1/reports/monthly")).json()
    assert any(r["month"] == "2026-08-01" for r in rows)
    assert not any(r["month"] == "2026-09-01" for r in rows)
