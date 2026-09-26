"""Metas de ahorro (fase 5)."""

import uuid
from types import SimpleNamespace


def _payload(**over) -> dict:
    base = {
        "id": str(uuid.uuid4()),
        "name": "Vacaciones",
        "target_amount": 500000,
        "currency": "ARS",
    }
    base.update(over)
    return base


async def test_crear_meta(api: SimpleNamespace) -> None:
    r = await api.client.post("/api/v1/goals", json=_payload())
    assert r.status_code == 201, r.text
    assert r.json()["target_amount"] == 500000
    assert r.json()["archived"] is False


async def test_editar_y_archivar_meta(api: SimpleNamespace) -> None:
    g = (await api.client.post("/api/v1/goals", json=_payload())).json()
    r = await api.client.patch(f"/api/v1/goals/{g['id']}", json={"target_amount": 800000})
    assert r.status_code == 200
    assert r.json()["target_amount"] == 800000
    assert (await api.client.patch(f"/api/v1/goals/{g['id']}", json={"archived": True})).json()[
        "archived"
    ] is True


async def test_borrar_meta(api: SimpleNamespace) -> None:
    g = (await api.client.post("/api/v1/goals", json=_payload())).json()
    assert (await api.client.delete(f"/api/v1/goals/{g['id']}")).status_code == 204
    assert (await api.fila("goals", g["id"]))["deleted_at"] is not None


async def test_meta_ajena_404(api: SimpleNamespace) -> None:
    assert (
        await api.client.patch(f"/api/v1/goals/{uuid.uuid4()}", json={"name": "x"})
    ).status_code == 404
