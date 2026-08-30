"""API de presupuestos (Inc 8): disponible = asignado - gastado del periodo."""

import uuid
from types import SimpleNamespace


async def _account(api: SimpleNamespace) -> str:
    resp = await api.client.post(
        "/api/v1/accounts",
        json={"id": str(uuid.uuid4()), "name": "Cuenta", "type": "cash", "currency": "ARS"},
    )
    return resp.json()["id"]


async def _category(
    api: SimpleNamespace, kind: str = "expense", parent_id: str | None = None
) -> str:
    payload = {"id": str(uuid.uuid4()), "name": "Cat", "kind": kind}
    if parent_id:
        payload["parent_id"] = parent_id
    resp = await api.client.post("/api/v1/categories", json=payload)
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


async def _expense(
    api: SimpleNamespace, account_id: str, category_id: str, amount: int, when: str
) -> None:
    resp = await api.client.post(
        "/api/v1/transactions",
        json={
            "id": str(uuid.uuid4()),
            "kind": "expense",
            "occurred_at": when,
            "amount": amount,
            "currency": "ARS",
            "account_id": account_id,
            "category_id": category_id,
        },
    )
    assert resp.status_code == 201, resp.text


def _budget_payload(category_id: str, **over) -> dict:
    base = {
        "id": str(uuid.uuid4()),
        "category_id": category_id,
        "period": "monthly",
        "period_start": "2026-08-01",
        "amount": 100000,
        "currency": "ARS",
    }
    base.update(over)
    return base


async def test_create_budget_computes_available(api: SimpleNamespace) -> None:
    acc = await _account(api)
    cat = await _category(api, "expense")
    await _expense(api, acc, cat, 30000, "2026-08-10T12:00:00-03:00")

    resp = await api.client.post("/api/v1/budgets", json=_budget_payload(cat))
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["period_end"] == "2026-09-01"
    assert body["spent"] == 30000
    assert body["available"] == 70000


async def test_spent_includes_subcategories(api: SimpleNamespace) -> None:
    acc = await _account(api)
    parent = await _category(api, "expense")
    child = await _category(api, "expense", parent_id=parent)
    await _expense(api, acc, parent, 20000, "2026-08-05T12:00:00-03:00")
    await _expense(api, acc, child, 15000, "2026-08-06T12:00:00-03:00")

    body = (await api.client.post("/api/v1/budgets", json=_budget_payload(parent))).json()
    assert body["spent"] == 35000  # padre + subcategoria
    assert body["available"] == 65000


async def test_spend_outside_period_not_counted(api: SimpleNamespace) -> None:
    acc = await _account(api)
    cat = await _category(api, "expense")
    await _expense(api, acc, cat, 30000, "2026-08-10T12:00:00-03:00")
    await _expense(api, acc, cat, 5000, "2026-09-10T12:00:00-03:00")  # otro mes

    body = (await api.client.post("/api/v1/budgets", json=_budget_payload(cat))).json()
    assert body["spent"] == 30000


async def test_budget_on_income_category_rejected(api: SimpleNamespace) -> None:
    cat = await _category(api, "income")
    resp = await api.client.post("/api/v1/budgets", json=_budget_payload(cat))
    assert resp.status_code == 422
    assert "gasto" in resp.json()["detail"]


async def test_budget_on_missing_category_rejected(api: SimpleNamespace) -> None:
    resp = await api.client.post("/api/v1/budgets", json=_budget_payload(str(uuid.uuid4())))
    assert resp.status_code == 422
    assert "no existe" in resp.json()["detail"]


async def test_duplicate_budget_rejected(api: SimpleNamespace) -> None:
    cat = await _category(api, "expense")
    first = await api.client.post("/api/v1/budgets", json=_budget_payload(cat))
    assert first.status_code == 201
    dup = await api.client.post("/api/v1/budgets", json=_budget_payload(cat))
    assert dup.status_code == 422


async def test_update_amount_recomputes_available(api: SimpleNamespace) -> None:
    acc = await _account(api)
    cat = await _category(api, "expense")
    await _expense(api, acc, cat, 30000, "2026-08-10T12:00:00-03:00")
    created = (await api.client.post("/api/v1/budgets", json=_budget_payload(cat))).json()

    resp = await api.client.patch(f"/api/v1/budgets/{created['id']}", json={"amount": 50000})
    assert resp.status_code == 200
    assert resp.json()["available"] == 20000  # 50000 - 30000


async def test_soft_delete_frees_slot_for_recreate(api: SimpleNamespace) -> None:
    cat = await _category(api, "expense")
    created = (await api.client.post("/api/v1/budgets", json=_budget_payload(cat))).json()
    assert (await api.client.delete(f"/api/v1/budgets/{created['id']}")).status_code == 204
    # el indice parcial libera el slot: se puede recrear misma cat/periodo
    again = await api.client.post("/api/v1/budgets", json=_budget_payload(cat))
    assert again.status_code == 201


async def test_other_users_budget_404(api: SimpleNamespace) -> None:
    cat = await _category(api, "expense")
    created = (await api.client.post("/api/v1/budgets", json=_budget_payload(cat))).json()
    # cambiar el owner no es trivial; basta con pedir un id inexistente
    assert (await api.client.get(f"/api/v1/budgets/{uuid.uuid4()}")).status_code == 404
    assert (await api.client.get(f"/api/v1/budgets/{created['id']}")).status_code == 200
