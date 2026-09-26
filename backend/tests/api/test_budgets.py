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
    inexistente = uuid.uuid4()
    assert (
        await api.client.patch(f"/api/v1/budgets/{inexistente}", json={"amount": 1})
    ).status_code == 404


async def test_dos_monedas_para_el_mismo_sobre_y_mes(api: SimpleNamespace) -> None:
    # El sobre es categoria + moneda + mes (ver 0005): `Viaje 2027` en pesos
    # para lo local y en dolares para los pasajes son dos sobres distintos.
    cat = await _category(api)
    assert (
        await api.client.post("/api/v1/budgets", json=_payload(cat, currency="ARS"))
    ).status_code == 201
    assert (
        await api.client.post("/api/v1/budgets", json=_payload(cat, currency="USD", amount=50000))
    ).status_code == 201

    # Pero la misma moneda dos veces sigue siendo un duplicado.
    resp = await api.client.post("/api/v1/budgets", json=_payload(cat, currency="USD"))
    assert resp.status_code == 422
    assert "moneda" in resp.json()["detail"]


# --- Presupuesto del grupo (fase 3b.3, ver 0015) -----------------------------


async def _grupo(api: SimpleNamespace) -> str:
    gid = str(uuid.uuid4())
    assert (
        await api.client.post("/api/v1/groups", json={"id": gid, "name": "Casa"})
    ).status_code == 201
    return gid


async def _cat_grupo(api: SimpleNamespace, gid: str, kind: str = "expense") -> str:
    r = await api.client.post(
        "/api/v1/categories",
        json={"id": str(uuid.uuid4()), "name": "Super", "kind": kind, "group_id": gid},
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def test_presupuesto_de_grupo(api: SimpleNamespace) -> None:
    gid = await _grupo(api)
    cat = await _cat_grupo(api, gid)
    r = await api.client.post("/api/v1/budgets", json=_payload(cat, group_id=gid))
    assert r.status_code == 201, r.text
    assert r.json()["group_id"] == gid
    fila = await api.fila("budgets", r.json()["id"])
    assert fila["owner_id"] is None


async def test_presupuesto_grupo_ajeno_se_rechaza(api: SimpleNamespace) -> None:
    cat = await _category(api)
    r = await api.client.post("/api/v1/budgets", json=_payload(cat, group_id=str(uuid.uuid4())))
    assert r.status_code == 422
    assert "grupo no existe" in r.json()["detail"]


async def test_presupuesto_grupo_con_categoria_personal_se_rechaza(api: SimpleNamespace) -> None:
    # La categoria tiene que ser del grupo, no personal.
    gid = await _grupo(api)
    cat_personal = await _category(api)
    r = await api.client.post("/api/v1/budgets", json=_payload(cat_personal, group_id=gid))
    assert r.status_code == 422
    assert "categoria no existe" in r.json()["detail"]
