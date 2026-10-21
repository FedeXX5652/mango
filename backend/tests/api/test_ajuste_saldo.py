"""Ajuste de saldo (0033): las categorias del sistema que lo registran.

El cliente carga el ajuste sin conexion, con la categoria que ya bajo la
sincronizacion: el servidor las crea antes (migracion y login), no las deja
tocar y acepta el movimiento como cualquier otro.
"""

import uuid
from types import SimpleNamespace

from sqlalchemy import select

from app.crud.category import AJUSTE_EGRESO, AJUSTE_INGRESO, asegurar_ajustes
from app.models.category import Category

OCCURRED = "2026-10-20T12:00:00-03:00"


async def _ajustes(api: SimpleNamespace) -> list[Category]:
    res = await api.session.execute(
        select(Category).where(
            Category.owner_id == api.owner_id,
            Category.system_key.in_((AJUSTE_INGRESO, AJUSTE_EGRESO)),
            Category.deleted_at.is_(None),
        )
    )
    return list(res.scalars())


async def test_asegurar_crea_una_por_kind_y_no_duplica(api: SimpleNamespace) -> None:
    await asegurar_ajustes(api.session, api.owner_id)
    await asegurar_ajustes(api.session, api.owner_id)
    cats = await _ajustes(api)
    assert sorted((c.system_key, c.kind, c.name) for c in cats) == [
        (AJUSTE_EGRESO, "expense", "Ajuste de cuenta"),
        (AJUSTE_INGRESO, "income", "Ajuste de cuenta"),
    ]


async def test_no_se_edita_ni_se_borra(api: SimpleNamespace) -> None:
    await asegurar_ajustes(api.session, api.owner_id)
    cat = next(c for c in await _ajustes(api) if c.system_key == AJUSTE_EGRESO)
    # Ni el nombre: a diferencia de "Reintegros de grupo", no se ve ni se toca.
    resp = await api.client.patch(f"/api/v1/categories/{cat.id}", json={"name": "Otro"})
    assert resp.status_code == 422
    resp = await api.client.delete(f"/api/v1/categories/{cat.id}")
    assert resp.status_code == 422
    assert (await api.fila("categories", cat.id))["name"] == "Ajuste de cuenta"


async def test_un_ajuste_se_guarda_como_cualquier_movimiento(api: SimpleNamespace) -> None:
    await asegurar_ajustes(api.session, api.owner_id)
    cats = {c.system_key: c for c in await _ajustes(api)}
    resp = await api.client.post(
        "/api/v1/accounts",
        json={"id": str(uuid.uuid4()), "name": "Banco", "type": "bank", "currency": "ARS"},
    )
    cuenta = resp.json()["id"]
    for kind, clave in (("expense", AJUSTE_EGRESO), ("income", AJUSTE_INGRESO)):
        tx = {
            "id": str(uuid.uuid4()),
            "kind": kind,
            "occurred_at": OCCURRED,
            # Monto grande: centavos en BIGINT, sin perder precision.
            "amount": 9_007_199_254_740_993,
            "currency": "ARS",
            "account_id": cuenta,
            "category_id": str(cats[clave].id),
        }
        resp = await api.client.post("/api/v1/transactions", json=tx)
        assert resp.status_code == 201, resp.text
        assert (await api.fila("transactions", tx["id"]))["amount"] == 9_007_199_254_740_993
