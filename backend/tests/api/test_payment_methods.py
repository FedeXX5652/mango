"""API de medios de pago y asociacion por moneda (Inc 5)."""

import uuid
from types import SimpleNamespace

from sqlalchemy import text


async def _account(api: SimpleNamespace, currency: str = "ARS") -> str:
    payload = {
        "id": str(uuid.uuid4()),
        "name": f"Cuenta {currency}",
        "type": "savings",
        "currency": currency,
    }
    resp = await api.client.post("/api/v1/accounts", json=payload)
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def _pm_payload(**over) -> dict:
    base = {"id": str(uuid.uuid4()), "name": "Debito 8027", "kind": "debit_card", "last4": "8027"}
    base.update(over)
    return base


async def _pm(api: SimpleNamespace, **over) -> dict:
    resp = await api.client.post("/api/v1/payment-methods", json=_pm_payload(**over))
    assert resp.status_code == 201, resp.text
    return resp.json()


async def test_create_payment_method(api: SimpleNamespace) -> None:
    body = await _pm(api)
    assert body["last4"] == "8027"
    assert body["kind"] == "debit_card"
    assert body["archived"] is False


async def test_default_account_must_exist(api: SimpleNamespace) -> None:
    resp = await api.client.post(
        "/api/v1/payment-methods", json=_pm_payload(default_account_id=str(uuid.uuid4()))
    )
    assert resp.status_code == 422
    assert "cuenta por defecto" in resp.json()["detail"].lower()


async def test_default_account_ok(api: SimpleNamespace) -> None:
    acc = await _account(api)
    body = await _pm(api, default_account_id=acc)
    assert body["default_account_id"] == acc


async def test_closing_day_out_of_range_rejected(api: SimpleNamespace) -> None:
    resp = await api.client.post("/api/v1/payment-methods", json=_pm_payload(closing_day=45))
    assert resp.status_code == 422


async def test_other_users_pm_is_404(api: SimpleNamespace) -> None:
    other_user = uuid.uuid4()
    other_pm = uuid.uuid4()
    await api.session.execute(
        text(
            "INSERT INTO users (id, email, password_hash, display_name) "
            "VALUES (:id, :email, 'x', 'Otro')"
        ),
        {"id": other_user, "email": f"{other_user}@test.local"},
    )
    await api.session.execute(
        text(
            "INSERT INTO payment_methods (id, owner_id, name, kind) "
            "VALUES (:id, :owner, 'Ajeno', 'cash')"
        ),
        {"id": other_pm, "owner": other_user},
    )
    await api.session.flush()
    assert (await api.client.get(f"/api/v1/payment-methods/{other_pm}")).status_code == 404


# --- Asociacion por moneda --------------------------------------------------


async def test_add_and_list_mapping(api: SimpleNamespace) -> None:
    pm = await _pm(api)
    acc = await _account(api, "ARS")
    resp = await api.client.post(
        f"/api/v1/payment-methods/{pm['id']}/accounts",
        json={"id": str(uuid.uuid4()), "currency": "ARS", "account_id": acc},
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["account_id"] == acc

    listed = (await api.client.get(f"/api/v1/payment-methods/{pm['id']}/accounts")).json()
    assert len(listed) == 1
    assert listed[0]["currency"] == "ARS"


async def test_mapping_currency_normalized(api: SimpleNamespace) -> None:
    pm = await _pm(api)
    acc = await _account(api, "USD")
    resp = await api.client.post(
        f"/api/v1/payment-methods/{pm['id']}/accounts",
        json={"id": str(uuid.uuid4()), "currency": "usd", "account_id": acc},
    )
    assert resp.status_code == 201
    assert resp.json()["currency"] == "USD"


async def test_duplicate_currency_rejected(api: SimpleNamespace) -> None:
    pm = await _pm(api)
    acc1 = await _account(api, "ARS")
    acc2 = await _account(api, "ARS")
    first = await api.client.post(
        f"/api/v1/payment-methods/{pm['id']}/accounts",
        json={"id": str(uuid.uuid4()), "currency": "ARS", "account_id": acc1},
    )
    assert first.status_code == 201
    dup = await api.client.post(
        f"/api/v1/payment-methods/{pm['id']}/accounts",
        json={"id": str(uuid.uuid4()), "currency": "ARS", "account_id": acc2},
    )
    assert dup.status_code == 422
    assert "ARS" in dup.json()["detail"]


async def test_mapping_account_must_exist(api: SimpleNamespace) -> None:
    pm = await _pm(api)
    resp = await api.client.post(
        f"/api/v1/payment-methods/{pm['id']}/accounts",
        json={"id": str(uuid.uuid4()), "currency": "ARS", "account_id": str(uuid.uuid4())},
    )
    assert resp.status_code == 422
    assert "cuenta" in resp.json()["detail"].lower()


async def test_mapping_on_missing_pm_is_404(api: SimpleNamespace) -> None:
    acc = await _account(api)
    resp = await api.client.post(
        f"/api/v1/payment-methods/{uuid.uuid4()}/accounts",
        json={"id": str(uuid.uuid4()), "currency": "ARS", "account_id": acc},
    )
    assert resp.status_code == 404


async def test_delete_mapping_frees_currency(api: SimpleNamespace) -> None:
    pm = await _pm(api)
    acc = await _account(api, "ARS")
    created = (
        await api.client.post(
            f"/api/v1/payment-methods/{pm['id']}/accounts",
            json={"id": str(uuid.uuid4()), "currency": "ARS", "account_id": acc},
        )
    ).json()

    assert (
        await api.client.delete(f"/api/v1/payment-methods/{pm['id']}/accounts/{created['id']}")
    ).status_code == 204

    # Liberada la moneda: se puede volver a asociar ARS.
    again = await api.client.post(
        f"/api/v1/payment-methods/{pm['id']}/accounts",
        json={"id": str(uuid.uuid4()), "currency": "ARS", "account_id": acc},
    )
    assert again.status_code == 201
