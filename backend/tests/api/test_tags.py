"""API de etiquetas y de su asociacion a movimientos (ver 3.5.1)."""

import uuid
from types import SimpleNamespace


def _tag(**over) -> dict:
    base = {"id": str(uuid.uuid4()), "name": "Viaje 2027"}
    base.update(over)
    return base


async def _cuenta(api: SimpleNamespace) -> str:
    resp = await api.client.post(
        "/api/v1/accounts",
        json={"id": str(uuid.uuid4()), "name": "Efectivo", "type": "cash", "currency": "ARS"},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


async def _categoria(api: SimpleNamespace) -> str:
    resp = await api.client.post(
        "/api/v1/categories",
        json={"id": str(uuid.uuid4()), "name": "Comida", "kind": "expense"},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


async def _movimiento(api: SimpleNamespace) -> str:
    resp = await api.client.post(
        "/api/v1/transactions",
        json={
            "id": str(uuid.uuid4()),
            "kind": "expense",
            "occurred_at": "2026-09-01T12:00:00Z",
            "amount": 230272,
            "currency": "ARS",
            "account_id": await _cuenta(api),
            "category_id": await _categoria(api),
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


async def test_create_tag(api: SimpleNamespace) -> None:
    resp = await api.client.post("/api/v1/tags", json=_tag(color="#FDBE02"))
    assert resp.status_code == 201, resp.text
    assert resp.json()["name"] == "Viaje 2027"
    assert resp.json()["archived"] is False


async def test_nombre_vacio_rechazado(api: SimpleNamespace) -> None:
    resp = await api.client.post("/api/v1/tags", json=_tag(name="   "))
    assert resp.status_code == 422


async def test_nombre_duplicado_rechazado(api: SimpleNamespace) -> None:
    assert (await api.client.post("/api/v1/tags", json=_tag())).status_code == 201
    # Mismo nombre con otra capitalizacion: sigue siendo la misma etiqueta.
    dup = await api.client.post("/api/v1/tags", json=_tag(name="viaje 2027"))
    assert dup.status_code == 422


async def test_listado_alfabetico(api: SimpleNamespace) -> None:
    for nombre in ("Zapatos", "asado", "Mudanza"):
        assert (await api.client.post("/api/v1/tags", json=_tag(name=nombre))).status_code == 201
    nombres = [t["name"] for t in (await api.client.get("/api/v1/tags")).json()]
    assert nombres == ["asado", "Mudanza", "Zapatos"]


async def test_renombrar_y_archivar(api: SimpleNamespace) -> None:
    creada = (await api.client.post("/api/v1/tags", json=_tag())).json()
    resp = await api.client.patch(
        f"/api/v1/tags/{creada['id']}", json={"name": "Viaje Brasil", "archived": True}
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "Viaje Brasil"
    assert resp.json()["archived"] is True


async def test_excluir_archivadas(api: SimpleNamespace) -> None:
    creada = (await api.client.post("/api/v1/tags", json=_tag())).json()
    await api.client.patch(f"/api/v1/tags/{creada['id']}", json={"archived": True})
    activas = (await api.client.get("/api/v1/tags?include_archived=false")).json()
    assert activas == []


async def test_soft_delete_libera_el_nombre(api: SimpleNamespace) -> None:
    creada = (await api.client.post("/api/v1/tags", json=_tag())).json()
    assert (await api.client.delete(f"/api/v1/tags/{creada['id']}")).status_code == 204
    # El unico parcial respeta el borrado logico: se puede volver a usar.
    assert (await api.client.post("/api/v1/tags", json=_tag())).status_code == 201


async def test_other_user_404(api: SimpleNamespace) -> None:
    assert (await api.client.get(f"/api/v1/tags/{uuid.uuid4()}")).status_code == 404


async def test_etiquetar_movimiento(api: SimpleNamespace) -> None:
    tag = (await api.client.post("/api/v1/tags", json=_tag())).json()
    tx = await _movimiento(api)
    resp = await api.client.post(
        "/api/v1/transaction-tags",
        json={"id": str(uuid.uuid4()), "transaction_id": tx, "tag_id": tag["id"]},
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["tag_id"] == tag["id"]


async def test_misma_etiqueta_dos_veces_rechazada(api: SimpleNamespace) -> None:
    tag = (await api.client.post("/api/v1/tags", json=_tag())).json()
    tx = await _movimiento(api)
    cuerpo = {"id": str(uuid.uuid4()), "transaction_id": tx, "tag_id": tag["id"]}
    assert (await api.client.post("/api/v1/transaction-tags", json=cuerpo)).status_code == 201
    otra = {"id": str(uuid.uuid4()), "transaction_id": tx, "tag_id": tag["id"]}
    assert (await api.client.post("/api/v1/transaction-tags", json=otra)).status_code == 422


async def test_varias_etiquetas_en_un_movimiento(api: SimpleNamespace) -> None:
    tx = await _movimiento(api)
    for nombre in ("Viaje 2027", "Regalos"):
        tag = (await api.client.post("/api/v1/tags", json=_tag(name=nombre))).json()
        resp = await api.client.post(
            "/api/v1/transaction-tags",
            json={"id": str(uuid.uuid4()), "transaction_id": tx, "tag_id": tag["id"]},
        )
        assert resp.status_code == 201, resp.text


async def test_etiqueta_inexistente_rechazada(api: SimpleNamespace) -> None:
    tx = await _movimiento(api)
    resp = await api.client.post(
        "/api/v1/transaction-tags",
        json={"id": str(uuid.uuid4()), "transaction_id": tx, "tag_id": str(uuid.uuid4())},
    )
    assert resp.status_code == 422


async def test_desetiquetar(api: SimpleNamespace) -> None:
    tag = (await api.client.post("/api/v1/tags", json=_tag())).json()
    tx = await _movimiento(api)
    tt = (
        await api.client.post(
            "/api/v1/transaction-tags",
            json={"id": str(uuid.uuid4()), "transaction_id": tx, "tag_id": tag["id"]},
        )
    ).json()
    assert (await api.client.delete(f"/api/v1/transaction-tags/{tt['id']}")).status_code == 204
    # Liberada la asociacion, se puede volver a etiquetar.
    de_nuevo = await api.client.post(
        "/api/v1/transaction-tags",
        json={"id": str(uuid.uuid4()), "transaction_id": tx, "tag_id": tag["id"]},
    )
    assert de_nuevo.status_code == 201


async def test_asociacion_de_otro_usuario_404(api: SimpleNamespace) -> None:
    assert (await api.client.delete(f"/api/v1/transaction-tags/{uuid.uuid4()}")).status_code == 404
