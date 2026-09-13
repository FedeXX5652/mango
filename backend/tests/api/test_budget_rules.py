"""API de asignaciones recurrentes a sobres (budget_rules) + su aplicacion
mensual via /recurring/run."""

import uuid
from types import SimpleNamespace

from sqlalchemy import text

from tests.conftest import _plano


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


async def _budgets(api: SimpleNamespace) -> list[dict]:
    """Los sobres del usuario, leidos de la base: la API ya no tiene GET."""
    res = await api.session.execute(
        text("SELECT * FROM budgets WHERE owner_id = :o AND deleted_at IS NULL"),
        {"o": api.owner_id},
    )
    return [_plano(dict(m)) for m in res.mappings()]


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
    inexistente = uuid.uuid4()
    assert (
        await api.client.patch(f"/api/v1/budget-rules/{inexistente}", json={"amount": 1})
    ).status_code == 404


async def test_large_amount_no_precision_loss(api: SimpleNamespace) -> None:
    # Montos en centavos como BIGINT: sin float ni perdida de precision.
    cat = await _category(api)
    grande = 9_007_199_254_740_993  # > 2^53, rompe si alguien usa float
    created = (
        await api.client.post("/api/v1/budget-rules", json=_payload(cat, amount=grande))
    ).json()
    assert created["amount"] == grande
    fetched = await api.fila("budget_rules", created["id"])
    assert fetched["amount"] == grande


async def test_dos_reglas_para_el_mismo_sobre_en_monedas_distintas(api: SimpleNamespace) -> None:
    # Un sobre por moneda (ver 0005): la recurrente en pesos y la en dolares
    # son dos reglas.
    cat = await _category(api)
    assert (
        await api.client.post("/api/v1/budget-rules", json=_payload(cat, currency="ARS"))
    ).status_code == 201
    assert (
        await api.client.post(
            "/api/v1/budget-rules", json=_payload(cat, currency="USD", amount=20000)
        )
    ).status_code == 201

    # La misma moneda dos veces sigue siendo duplicado.
    resp = await api.client.post("/api/v1/budget-rules", json=_payload(cat, currency="USD"))
    assert resp.status_code == 422
    assert "moneda" in resp.json()["detail"]
