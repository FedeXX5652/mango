"""API de categorias (Inc 4): jerarquia de dos niveles y kind coherente."""

import uuid
from types import SimpleNamespace

from sqlalchemy import text


def _payload(**over) -> dict:
    base = {"id": str(uuid.uuid4()), "name": "Transporte", "kind": "expense"}
    base.update(over)
    return base


async def _create(api: SimpleNamespace, **over) -> dict:
    resp = await api.client.post("/api/v1/categories", json=_payload(**over))
    assert resp.status_code == 201, resp.text
    return resp.json()


async def test_create_top_level(api: SimpleNamespace) -> None:
    body = await _create(api)
    assert body["parent_id"] is None
    assert body["kind"] == "expense"


async def test_create_subcategory(api: SimpleNamespace) -> None:
    parent = await _create(api, name="Transporte", kind="expense")
    child = await _create(api, name="Colectivo", kind="expense", parent_id=parent["id"])
    assert child["parent_id"] == parent["id"]


async def test_third_level_rejected(api: SimpleNamespace) -> None:
    parent = await _create(api, name="Comida", kind="expense")
    child = await _create(api, name="Delivery", kind="expense", parent_id=parent["id"])
    resp = await api.client.post(
        "/api/v1/categories",
        json=_payload(name="PedidosYa", kind="expense", parent_id=child["id"]),
    )
    assert resp.status_code == 422
    assert "dos niveles" in resp.json()["detail"]


async def test_subcategory_kind_must_match_parent(api: SimpleNamespace) -> None:
    parent = await _create(api, name="Sueldo", kind="income")
    resp = await api.client.post(
        "/api/v1/categories",
        json=_payload(name="Aguinaldo", kind="expense", parent_id=parent["id"]),
    )
    assert resp.status_code == 422
    assert "kind" in resp.json()["detail"]


async def test_nonexistent_parent_rejected(api: SimpleNamespace) -> None:
    resp = await api.client.post(
        "/api/v1/categories",
        json=_payload(name="Huerfana", kind="expense", parent_id=str(uuid.uuid4())),
    )
    assert resp.status_code == 422
    assert "padre" in resp.json()["detail"]


async def test_invalid_kind_rejected(api: SimpleNamespace) -> None:
    resp = await api.client.post("/api/v1/categories", json=_payload(kind="inversion"))
    assert resp.status_code == 422


async def test_other_users_category_is_404(api: SimpleNamespace) -> None:
    other_user = uuid.uuid4()
    other_cat = uuid.uuid4()
    await api.session.execute(
        text(
            "INSERT INTO users (id, email, password_hash, display_name) "
            "VALUES (:id, :email, 'x', 'Otro')"
        ),
        {"id": other_user, "email": f"{other_user}@test.local"},
    )
    await api.session.execute(
        text(
            "INSERT INTO categories (id, owner_id, name, kind) "
            "VALUES (:id, :owner, 'Ajena', 'expense')"
        ),
        {"id": other_cat, "owner": other_user},
    )
    await api.session.flush()
    resp = await api.client.get(f"/api/v1/categories/{other_cat}")
    assert resp.status_code == 404


async def test_list_parents_before_children(api: SimpleNamespace) -> None:
    parent = await _create(api, name="Salud", kind="expense")
    await _create(api, name="Medicamentos", kind="expense", parent_id=parent["id"])
    listed = (await api.client.get("/api/v1/categories")).json()
    ids = [c["id"] for c in listed]
    # el padre aparece antes que su hija
    assert ids.index(parent["id"]) < ids.index(
        next(c["id"] for c in listed if c["parent_id"] == parent["id"])
    )


async def test_update_and_soft_delete(api: SimpleNamespace) -> None:
    cat = await _create(api)
    upd = await api.client.patch(f"/api/v1/categories/{cat['id']}", json={"name": "Movilidad"})
    assert upd.status_code == 200
    assert upd.json()["name"] == "Movilidad"

    assert (await api.client.delete(f"/api/v1/categories/{cat['id']}")).status_code == 204
    assert (await api.client.get(f"/api/v1/categories/{cat['id']}")).status_code == 404


# --- Mover de padre (necesario para "eliminar y mover", ver ESPECIFICACION 3.3)


async def _cat(api, nombre: str, kind: str = "expense", parent: str | None = None) -> str:
    cuerpo = {"id": str(uuid.uuid4()), "name": nombre, "kind": kind}
    if parent:
        cuerpo["parent_id"] = parent
    resp = await api.client.post("/api/v1/categories", json=cuerpo)
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


async def test_mover_subcategoria_a_otra_raiz(api) -> None:
    vieja = await _cat(api, "Vivienda")
    nueva = await _cat(api, "Servicios del hogar")
    hija = await _cat(api, "Alquiler", parent=vieja)

    resp = await api.client.patch(f"/api/v1/categories/{hija}", json={"parent_id": nueva})
    assert resp.status_code == 200, resp.text
    # Antes este PATCH devolvia 200 y NO movia nada: el campo no estaba en el
    # esquema y Pydantic lo descartaba en silencio.
    assert resp.json()["parent_id"] == nueva


async def test_mover_a_raiz_con_parent_null(api) -> None:
    padre = await _cat(api, "Vivienda")
    hija = await _cat(api, "Alquiler", parent=padre)

    resp = await api.client.patch(f"/api/v1/categories/{hija}", json={"parent_id": None})
    assert resp.status_code == 200, resp.text
    assert resp.json()["parent_id"] is None


async def test_no_puede_ser_su_propio_padre(api) -> None:
    cat = await _cat(api, "Comida")
    resp = await api.client.patch(f"/api/v1/categories/{cat}", json={"parent_id": cat})
    assert resp.status_code == 422
    assert "propio padre" in resp.json()["detail"]


async def test_no_se_permiten_tres_niveles(api) -> None:
    raiz = await _cat(api, "Comida")
    hija = await _cat(api, "Supermercado", parent=raiz)
    otra = await _cat(api, "Ocio")
    huerfana = await _cat(api, "Streaming", parent=otra)

    # Colgar de una subcategoria haria tres niveles.
    resp = await api.client.patch(f"/api/v1/categories/{huerfana}", json={"parent_id": hija})
    assert resp.status_code == 422
    assert "dos niveles" in resp.json()["detail"]


async def test_una_categoria_con_hijas_no_puede_volverse_subcategoria(api) -> None:
    padre = await _cat(api, "Vivienda")
    await _cat(api, "Alquiler", parent=padre)
    destino = await _cat(api, "Casa")

    resp = await api.client.patch(f"/api/v1/categories/{padre}", json={"parent_id": destino})
    assert resp.status_code == 422
    assert "subcategorias" in resp.json()["detail"]


async def test_el_padre_debe_tener_el_mismo_kind(api) -> None:
    gasto = await _cat(api, "Comida", kind="expense")
    ingreso = await _cat(api, "Sueldo", kind="income")
    resp = await api.client.patch(f"/api/v1/categories/{gasto}", json={"parent_id": ingreso})
    assert resp.status_code == 422
    assert "kind" in resp.json()["detail"]


async def test_el_kind_sigue_siendo_inmutable(api) -> None:
    cat = await _cat(api, "Comida", kind="expense")
    resp = await api.client.patch(f"/api/v1/categories/{cat}", json={"kind": "income"})
    # El campo no esta en el esquema: se ignora, y el kind no cambia.
    assert resp.status_code == 200
    assert resp.json()["kind"] == "expense"
