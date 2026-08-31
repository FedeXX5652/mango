"""API de asignaciones a sobres (presupuesto por sobres). CRUD plano."""

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
        "period_start": "2026-08-01",
        "amount": 100000,
        "currency": "ARS",
    }
    base.update(over)
    return base


async def test_create_assignment(api: SimpleNamespace) -> None:
    cat = await _category(api)
    resp = await api.client.post("/api/v1/budgets", json=_payload(cat))
    assert resp.status_code == 201, resp.text
    assert resp.json()["amount"] == 100000
    assert resp.json()["period_start"] == "2026-08-01"


async def test_on_income_category_rejected(api: SimpleNamespace) -> None:
    cat = await _category(api, "income")
    resp = await api.client.post("/api/v1/budgets", json=_payload(cat))
    assert resp.status_code == 422
    assert "gasto" in resp.json()["detail"]


async def test_missing_category_rejected(api: SimpleNamespace) -> None:
    resp = await api.client.post("/api/v1/budgets", json=_payload(str(uuid.uuid4())))
    assert resp.status_code == 422


async def test_duplicate_same_month_rejected(api: SimpleNamespace) -> None:
    cat = await _category(api)
    assert (await api.client.post("/api/v1/budgets", json=_payload(cat))).status_code == 201
    dup = await api.client.post("/api/v1/budgets", json=_payload(cat))
    assert dup.status_code == 422


async def test_update_amount(api: SimpleNamespace) -> None:
    cat = await _category(api)
    created = (await api.client.post("/api/v1/budgets", json=_payload(cat))).json()
    resp = await api.client.patch(f"/api/v1/budgets/{created['id']}", json={"amount": 50000})
    assert resp.status_code == 200
    assert resp.json()["amount"] == 50000


async def test_soft_delete_frees_slot(api: SimpleNamespace) -> None:
    cat = await _category(api)
    created = (await api.client.post("/api/v1/budgets", json=_payload(cat))).json()
    assert (await api.client.delete(f"/api/v1/budgets/{created['id']}")).status_code == 204
    # el indice parcial libera el slot: se puede reasignar mismo sobre/mes
    again = await api.client.post("/api/v1/budgets", json=_payload(cat))
    assert again.status_code == 201


async def test_other_user_404(api: SimpleNamespace) -> None:
    assert (await api.client.get(f"/api/v1/budgets/{uuid.uuid4()}")).status_code == 404
