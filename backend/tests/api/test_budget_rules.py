"""API de asignaciones recurrentes a sobres (budget_rules) + su aplicacion
mensual via /recurring/run."""

import uuid
from types import SimpleNamespace


async def _category(api: SimpleNamespace, kind: str = "expense") -> str:
    resp = await api.client.post(
        "/api/v1/categories",
        json={"id": str(uuid.uuid4()), "name": "Cat", "kind": kind},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def _payload(category_id: str, **over) -> dict:
    base = {
        "id": str(uuid.uuid4()),
        "category_id": category_id,
        "amount": 100000,
        "currency": "ARS",
    }
    base.update(over)
    return base


async def test_create_rule(api: SimpleNamespace) -> None:
    cat = await _category(api)
    resp = await api.client.post("/api/v1/budget-rules", json=_payload(cat))
    assert resp.status_code == 201, resp.text
    assert resp.json()["amount"] == 100000
    assert resp.json()["active"] is True


async def test_on_income_category_rejected(api: SimpleNamespace) -> None:
    cat = await _category(api, "income")
    resp = await api.client.post("/api/v1/budget-rules", json=_payload(cat))
    assert resp.status_code == 422
    assert "gasto" in resp.json()["detail"]


async def test_missing_category_rejected(api: SimpleNamespace) -> None:
    resp = await api.client.post("/api/v1/budget-rules", json=_payload(str(uuid.uuid4())))
    assert resp.status_code == 422


async def test_duplicate_rule_rejected(api: SimpleNamespace) -> None:
    cat = await _category(api)
    assert (await api.client.post("/api/v1/budget-rules", json=_payload(cat))).status_code == 201
    dup = await api.client.post("/api/v1/budget-rules", json=_payload(cat))
    assert dup.status_code == 422


async def test_update_and_pause(api: SimpleNamespace) -> None:
    cat = await _category(api)
    created = (await api.client.post("/api/v1/budget-rules", json=_payload(cat))).json()
    resp = await api.client.patch(
        f"/api/v1/budget-rules/{created['id']}", json={"amount": 50000, "active": False}
    )
    assert resp.status_code == 200
    assert resp.json()["amount"] == 50000
    assert resp.json()["active"] is False


async def test_soft_delete_frees_slot(api: SimpleNamespace) -> None:
    cat = await _category(api)
    created = (await api.client.post("/api/v1/budget-rules", json=_payload(cat))).json()
    assert (await api.client.delete(f"/api/v1/budget-rules/{created['id']}")).status_code == 204
    again = await api.client.post("/api/v1/budget-rules", json=_payload(cat))
    assert again.status_code == 201


async def test_other_user_404(api: SimpleNamespace) -> None:
    assert (await api.client.get(f"/api/v1/budget-rules/{uuid.uuid4()}")).status_code == 404


async def test_large_amount_no_precision_loss(api: SimpleNamespace) -> None:
    # Montos en centavos como BIGINT: sin float ni perdida de precision.
    cat = await _category(api)
    grande = 9_007_199_254_740_993  # > 2^53, rompe si alguien usa float
    created = (
        await api.client.post("/api/v1/budget-rules", json=_payload(cat, amount=grande))
    ).json()
    assert created["amount"] == grande
    fetched = (await api.client.get(f"/api/v1/budget-rules/{created['id']}")).json()
    assert fetched["amount"] == grande


async def test_run_applies_rule_once(api: SimpleNamespace) -> None:
    cat = await _category(api)
    await api.client.post("/api/v1/budget-rules", json=_payload(cat, amount=80000))

    r1 = await api.client.post("/api/v1/recurring/run?as_of=2026-08-15")
    assert r1.status_code == 200, r1.text
    assert r1.json()["budgets_created"] == 1

    budgets = (await api.client.get("/api/v1/budgets")).json()
    asignado = [b for b in budgets if b["category_id"] == cat and b["period_start"] == "2026-08-01"]
    assert len(asignado) == 1
    assert asignado[0]["amount"] == 80000

    # Correr de nuevo el mismo mes no duplica.
    r2 = await api.client.post("/api/v1/recurring/run?as_of=2026-08-20")
    assert r2.json()["budgets_created"] == 0


async def test_run_respects_manual_assignment(api: SimpleNamespace) -> None:
    cat = await _category(api)
    await api.client.post("/api/v1/budget-rules", json=_payload(cat, amount=80000))
    # Asignacion manual del mes: la regla no la pisa.
    manual = {
        "id": str(uuid.uuid4()),
        "category_id": cat,
        "period_start": "2026-09-01",
        "amount": 123456,
        "currency": "ARS",
    }
    assert (await api.client.post("/api/v1/budgets", json=manual)).status_code == 201

    r = await api.client.post("/api/v1/recurring/run?as_of=2026-09-10")
    assert r.json()["budgets_created"] == 0
    budgets = (await api.client.get("/api/v1/budgets")).json()
    sept = [b for b in budgets if b["category_id"] == cat and b["period_start"] == "2026-09-01"]
    assert len(sept) == 1
    assert sept[0]["amount"] == 123456
