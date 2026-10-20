"""Etiquetas de grupo (1.7.0): las usa y las administra cualquier miembro, y un
gasto del grupo lleva etiquetas del grupo."""

import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from types import SimpleNamespace

from sqlalchemy import text

from app.api.deps import get_current_user_id
from app.main import app


def _id() -> str:
    return str(uuid.uuid4())


async def _otro_usuario(api: SimpleNamespace, username: str) -> str:
    uid = _id()
    await api.session.execute(
        text(
            "INSERT INTO users (id, username, password_hash, display_name) "
            "VALUES (:id, :u, '!', :u)"
        ),
        {"id": uid, "u": username},
    )
    await api.session.flush()
    return uid


async def _casa(api: SimpleNamespace) -> tuple[str, str]:
    gid = _id()
    assert (
        await api.client.post("/api/v1/groups", json={"id": gid, "name": "Casa"})
    ).status_code == 201
    beto = await _otro_usuario(api, f"beto-{gid[:6]}")
    r = await api.client.post(f"/api/v1/groups/{gid}/members", json={"username": f"beto-{gid[:6]}"})
    assert r.status_code == 201, r.text
    return gid, beto


@contextmanager
def _como(uid: str) -> Iterator[None]:
    antes = app.dependency_overrides[get_current_user_id]
    app.dependency_overrides[get_current_user_id] = lambda: uuid.UUID(uid)
    try:
        yield
    finally:
        app.dependency_overrides[get_current_user_id] = antes


async def _etiqueta(api: SimpleNamespace, nombre: str, gid: str | None = None) -> tuple[int, str]:
    tid = _id()
    datos = {"id": tid, "name": nombre} | ({"group_id": gid} if gid else {})
    r = await api.client.post("/api/v1/tags", json=datos)
    return r.status_code, tid


async def _gasto(api: SimpleNamespace, gid: str | None) -> str:
    cuenta = _id()
    await api.client.post(
        "/api/v1/accounts", json={"id": cuenta, "name": "Caja", "type": "cash", "currency": "ARS"}
    )
    if gid:
        cat = str(
            (
                await api.session.execute(
                    text(
                        "SELECT id FROM categories WHERE group_id = :g AND kind = 'expense' "
                        "AND deleted_at IS NULL LIMIT 1"
                    ),
                    {"g": gid},
                )
            ).scalar_one()
        )
    else:
        cat = _id()
        await api.client.post(
            "/api/v1/categories", json={"id": cat, "name": "Súper", "kind": "expense"}
        )
    tx = _id()
    datos = {
        "id": tx,
        "kind": "expense",
        "occurred_at": "2026-10-01T12:00:00-03:00",
        "amount": 10000,
        "currency": "ARS",
        "account_id": cuenta,
        "category_id": cat,
    } | ({"visibility": "shared", "group_id": gid} if gid else {})
    r = await api.client.post("/api/v1/transactions", json=datos)
    assert r.status_code == 201, r.text
    return tx


async def test_una_etiqueta_del_grupo(api: SimpleNamespace) -> None:
    gid, _ = await _casa(api)
    estado, tid = await _etiqueta(api, "Vacaciones", gid)
    assert estado == 201
    assert (await api.fila("tags", tid))["group_id"] == gid


async def test_de_un_grupo_ajeno_no(api: SimpleNamespace) -> None:
    ajeno = await _otro_usuario(api, "ajeno")
    gid = _id()
    with _como(ajeno):
        await api.client.post("/api/v1/groups", json={"id": gid, "name": "Ajeno"})
    estado, _ = await _etiqueta(api, "X", gid)
    assert estado == 422


async def test_el_nombre_se_repite_por_ambito(api: SimpleNamespace) -> None:
    """Personal y del grupo pueden llamarse igual; dos del mismo grupo, no."""
    gid, beto = await _casa(api)
    assert (await _etiqueta(api, "Viaje"))[0] == 201
    assert (await _etiqueta(api, "Viaje", gid))[0] == 201
    with _como(beto):
        assert (await _etiqueta(api, "viaje", gid))[0] == 422


async def test_cualquier_miembro_la_edita_o_la_borra(api: SimpleNamespace) -> None:
    gid, beto = await _casa(api)
    _, tid = await _etiqueta(api, "Obra", gid)
    with _como(beto):
        r = await api.client.patch(f"/api/v1/tags/{tid}", json={"name": "Obra baño"})
        assert r.status_code == 200, r.text
        assert (await api.client.delete(f"/api/v1/tags/{tid}")).status_code == 204
    ajeno = await _otro_usuario(api, "ajeno3")
    _, otra = await _etiqueta(api, "Otra", gid)
    with _como(ajeno):
        assert (
            await api.client.patch(f"/api/v1/tags/{otra}", json={"name": "X"})
        ).status_code == 404


async def test_un_gasto_del_grupo_lleva_etiquetas_del_grupo(api: SimpleNamespace) -> None:
    gid, _ = await _casa(api)
    _, del_grupo = await _etiqueta(api, "Obra", gid)
    _, mia = await _etiqueta(api, "Mía")
    compartido = await _gasto(api, gid)
    personal = await _gasto(api, None)

    async def etiquetar(tx: str, tag: str) -> int:
        r = await api.client.post(
            "/api/v1/transaction-tags", json={"id": _id(), "transaction_id": tx, "tag_id": tag}
        )
        return r.status_code

    assert await etiquetar(compartido, del_grupo) == 201
    assert await etiquetar(compartido, mia) == 422
    assert await etiquetar(personal, mia) == 201
    assert await etiquetar(personal, del_grupo) == 422
