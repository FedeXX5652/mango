"""Grupos y membresía (fase 3b.1)."""

import uuid
from types import SimpleNamespace

from sqlalchemy import text


async def _otro_usuario(api: SimpleNamespace, username: str) -> str:
    uid = str(uuid.uuid4())
    await api.session.execute(
        text(
            "INSERT INTO users (id, username, email, password_hash, display_name) "
            "VALUES (:id, :u, :e, '!', :u)"
        ),
        {"id": uid, "u": username, "e": f"{uid}@test.local"},
    )
    await api.session.flush()
    return uid


def _grupo(**over) -> dict:
    base = {"id": str(uuid.uuid4()), "name": "Casa", "base_currency": "ARS"}
    base.update(over)
    return base


async def test_crear_grupo_deja_al_creador_de_owner(api: SimpleNamespace) -> None:
    payload = _grupo()
    resp = await api.client.post("/api/v1/groups", json=payload)
    assert resp.status_code == 201, resp.text
    assert resp.json()["created_by"] == str(api.owner_id)

    # El creador queda como miembro con rol owner.
    m = (
        await api.session.execute(
            text(
                "SELECT role FROM group_members WHERE group_id = :g AND user_id = :u"
                " AND deleted_at IS NULL"
            ),
            {"g": payload["id"], "u": api.owner_id},
        )
    ).scalar_one()
    assert m == "owner"


async def test_agregar_miembro_por_username(api: SimpleNamespace) -> None:
    g = _grupo()
    await api.client.post("/api/v1/groups", json=g)
    await _otro_usuario(api, "pareja")

    resp = await api.client.post(f"/api/v1/groups/{g['id']}/members", json={"username": "pareja"})
    assert resp.status_code == 201, resp.text
    assert resp.json()["role"] == "member"


async def test_agregar_username_inexistente_422(api: SimpleNamespace) -> None:
    g = _grupo()
    await api.client.post("/api/v1/groups", json=g)
    resp = await api.client.post(f"/api/v1/groups/{g['id']}/members", json={"username": "fantasma"})
    assert resp.status_code == 422


async def test_solo_el_owner_agrega(api: SimpleNamespace) -> None:
    # Grupo de OTRO usuario: agregar da 404 (no se revela que exista).
    otro = await _otro_usuario(api, "ajeno")
    gid = str(uuid.uuid4())
    await api.session.execute(
        text(
            "INSERT INTO groups (id, name, base_currency, created_by) "
            "VALUES (:id, 'Ajeno', 'ARS', :u)"
        ),
        {"id": gid, "u": otro},
    )
    await api.session.execute(
        text(
            "INSERT INTO group_members (id, group_id, user_id, role) VALUES (:id, :g, :u, 'owner')"
        ),
        {"id": str(uuid.uuid4()), "g": gid, "u": otro},
    )
    await api.session.flush()

    resp = await api.client.post(f"/api/v1/groups/{gid}/members", json={"username": "ajeno"})
    assert resp.status_code == 404


async def test_no_se_agrega_dos_veces(api: SimpleNamespace) -> None:
    g = _grupo()
    await api.client.post("/api/v1/groups", json=g)
    await _otro_usuario(api, "repetido")
    await api.client.post(f"/api/v1/groups/{g['id']}/members", json={"username": "repetido"})
    resp = await api.client.post(f"/api/v1/groups/{g['id']}/members", json={"username": "repetido"})
    assert resp.status_code == 422


async def test_reagregar_a_quien_salio_lo_reactiva(api: SimpleNamespace) -> None:
    g = _grupo()
    await api.client.post("/api/v1/groups", json=g)
    otro = await _otro_usuario(api, "vuelve")
    r1 = await api.client.post(f"/api/v1/groups/{g['id']}/members", json={"username": "vuelve"})
    assert r1.status_code == 201
    assert (await api.client.delete(f"/api/v1/groups/{g['id']}/members/{otro}")).status_code == 204
    # Reagregar no crea otra fila: reactiva la que estaba (unico por grupo+usuario).
    r2 = await api.client.post(f"/api/v1/groups/{g['id']}/members", json={"username": "vuelve"})
    assert r2.status_code == 201
    filas = (
        await api.session.execute(
            text("SELECT count(*) FROM group_members WHERE group_id = :g AND user_id = :u"),
            {"g": g["id"], "u": otro},
        )
    ).scalar_one()
    assert filas == 1


async def test_quitar_miembro(api: SimpleNamespace) -> None:
    g = _grupo()
    await api.client.post("/api/v1/groups", json=g)
    otro = await _otro_usuario(api, "saliente")
    await api.client.post(f"/api/v1/groups/{g['id']}/members", json={"username": "saliente"})
    assert (await api.client.delete(f"/api/v1/groups/{g['id']}/members/{otro}")).status_code == 204


async def test_no_se_puede_quitar_al_owner(api: SimpleNamespace) -> None:
    g = _grupo()
    await api.client.post("/api/v1/groups", json=g)
    # El owner es api.owner_id: quitarse a sí mismo deja el grupo sin dueño.
    resp = await api.client.delete(f"/api/v1/groups/{g['id']}/members/{api.owner_id}")
    assert resp.status_code == 422
