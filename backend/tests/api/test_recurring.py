"""API de reglas recurrentes (Inc 9): generacion y avance de next_run_date."""

import uuid
from types import SimpleNamespace


async def _account(api: SimpleNamespace) -> str:
    resp = await api.client.post(
        "/api/v1/accounts",
        json={"id": str(uuid.uuid4()), "name": "Cuenta", "type": "bank", "currency": "ARS"},
    )
    return resp.json()["id"]


async def _category(api: SimpleNamespace, kind: str = "expense") -> str:
    resp = await api.client.post(
        "/api/v1/categories",
        json={"id": str(uuid.uuid4()), "name": "Cat", "kind": kind},
    )
    return resp.json()["id"]


async def _rule(api: SimpleNamespace, **over) -> dict:
    acc = over.pop("account_id", None) or await _account(api)
    base = {
        "id": str(uuid.uuid4()),
        "name": "Alquiler",
        "kind": "expense",
        "account_id": acc,
        "amount": 500000,
        "currency": "ARS",
        "frequency": "monthly",
        "start_date": "2026-06-01",
        "next_run_date": "2026-06-01",
    }
    base.update(over)
    resp = await api.client.post("/api/v1/recurring", json=base)
    return resp


async def test_create_recurring_expense(api: SimpleNamespace) -> None:
    cat = await _category(api)
    resp = await _rule(api, category_id=cat)
    assert resp.status_code == 201, resp.text
    assert resp.json()["frequency"] == "monthly"


async def test_recurring_expense_requires_category(api: SimpleNamespace) -> None:
    resp = await _rule(api)  # sin category_id
    assert resp.status_code == 422
    assert "categoria" in resp.json()["detail"].lower()


async def test_run_generates_and_advances(api: SimpleNamespace) -> None:
    cat = await _category(api)
    rule = (await _rule(api, category_id=cat, next_run_date="2026-08-01")).json()

    resp = await api.client.post("/api/v1/recurring/run", params={"as_of": "2026-08-15"})
    assert resp.status_code == 200, resp.text
    assert resp.json()["generated"] == 1

    # next_run_date avanzo un mes.
    got = (await api.client.get(f"/api/v1/recurring/{rule['id']}")).json()
    assert got["next_run_date"] == "2026-09-01"

    # la transaccion generada existe y es source=recurring.
    txs = (await api.client.get("/api/v1/transactions")).json()
    assert any(t["source"] == "recurring" and t["amount"] == 500000 for t in txs)


async def test_run_catches_up_missed_periods(api: SimpleNamespace) -> None:
    cat = await _category(api)
    rule = (await _rule(api, category_id=cat, next_run_date="2026-06-01")).json()
    resp = await api.client.post("/api/v1/recurring/run", params={"as_of": "2026-08-15"})
    # 06-01, 07-01, 08-01 -> 3 generadas
    assert resp.json()["generated"] == 3
    got = (await api.client.get(f"/api/v1/recurring/{rule['id']}")).json()
    assert got["next_run_date"] == "2026-09-01"


async def test_run_respects_end_date(api: SimpleNamespace) -> None:
    cat = await _category(api)
    await _rule(api, category_id=cat, next_run_date="2026-06-01", end_date="2026-07-01")
    resp = await api.client.post("/api/v1/recurring/run", params={"as_of": "2026-08-15"})
    # solo 06-01 y 07-01 (<= end_date)
    assert resp.json()["generated"] == 2


async def test_run_skips_non_auto_and_inactive(api: SimpleNamespace) -> None:
    cat = await _category(api)
    await _rule(api, category_id=cat, next_run_date="2026-06-01", auto_create=False)
    await _rule(api, category_id=cat, next_run_date="2026-06-01", active=False)
    resp = await api.client.post("/api/v1/recurring/run", params={"as_of": "2026-08-15"})
    assert resp.json()["generated"] == 0


async def test_run_route_not_captured_as_id(api: SimpleNamespace) -> None:
    # /recurring/run no debe interpretarse como /recurring/{rule_id}.
    resp = await api.client.post("/api/v1/recurring/run", params={"as_of": "2026-08-15"})
    assert resp.status_code == 200
