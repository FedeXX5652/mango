"""API de plantillas (Inc 9): materializar de un toque."""

import uuid
from types import SimpleNamespace


async def _account(api: SimpleNamespace) -> str:
    resp = await api.client.post(
        "/api/v1/accounts",
        json={"id": str(uuid.uuid4()), "name": "Cuenta", "type": "cash", "currency": "ARS"},
    )
    return resp.json()["id"]


async def _category(api: SimpleNamespace, kind: str = "expense") -> str:
    resp = await api.client.post(
        "/api/v1/categories",
        json={"id": str(uuid.uuid4()), "name": "Cat", "kind": kind},
    )
    return resp.json()["id"]


async def _template(api: SimpleNamespace, **over) -> dict:
    base = {"id": str(uuid.uuid4()), "name": "Cafe", "kind": "expense"}
    base.update(over)
    resp = await api.client.post("/api/v1/templates", json=base)
    assert resp.status_code == 201, resp.text
    return resp.json()


def _apply(**over) -> dict:
    base = {"id": str(uuid.uuid4()), "occurred_at": "2026-08-15T09:00:00-03:00"}
    base.update(over)
    return base


async def test_create_template(api: SimpleNamespace) -> None:
    acc = await _account(api)
    cat = await _category(api)
    body = await _template(api, account_id=acc, category_id=cat, amount=1500, currency="ARS")
    assert body["amount"] == 1500
    assert body["kind"] == "expense"


async def test_apply_template_creates_transaction(api: SimpleNamespace) -> None:
    acc = await _account(api)
    cat = await _category(api)
    tmpl = await _template(api, account_id=acc, category_id=cat, amount=1500, currency="ARS")

    resp = await api.client.post(f"/api/v1/templates/{tmpl['id']}/apply", json=_apply())
    assert resp.status_code == 201, resp.text
    tx = resp.json()
    assert tx["amount"] == 1500
    assert tx["source"] == "template"
    assert tx["category_id"] == cat
    assert tx["status"] == "confirmed"


async def test_apply_override_amount(api: SimpleNamespace) -> None:
    acc = await _account(api)
    cat = await _category(api)
    tmpl = await _template(api, account_id=acc, category_id=cat, amount=1500, currency="ARS")
    resp = await api.client.post(f"/api/v1/templates/{tmpl['id']}/apply", json=_apply(amount=9999))
    assert resp.status_code == 201
    assert resp.json()["amount"] == 9999


async def test_apply_incomplete_template_rejected(api: SimpleNamespace) -> None:
    # Plantilla sin monto ni override -> no se puede materializar.
    acc = await _account(api)
    cat = await _category(api)
    tmpl = await _template(api, account_id=acc, category_id=cat, currency="ARS")
    resp = await api.client.post(f"/api/v1/templates/{tmpl['id']}/apply", json=_apply())
    assert resp.status_code == 422
    assert "monto" in resp.json()["detail"].lower()


async def test_apply_transfer_template(api: SimpleNamespace) -> None:
    origin = await _account(api)
    dest = await _account(api)
    tmpl = await _template(api, kind="transfer", account_id=origin, amount=5000, currency="ARS")
    resp = await api.client.post(
        f"/api/v1/templates/{tmpl['id']}/apply", json=_apply(transfer_account_id=dest)
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["transfer_account_id"] == dest


async def test_apply_missing_template_404(api: SimpleNamespace) -> None:
    resp = await api.client.post(f"/api/v1/templates/{uuid.uuid4()}/apply", json=_apply())
    assert resp.status_code == 404
