"""Plantillas de grupo y la validacion de las plantillas (1.6.0, ver 0030, T1)."""

import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from types import SimpleNamespace

from sqlalchemy import text

from app.api.deps import get_current_user_id
from app.main import app


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


async def _grupo_con_miembro(api: SimpleNamespace) -> tuple[str, str]:
    gid = str(uuid.uuid4())
    r = await api.client.post("/api/v1/groups", json={"id": gid, "name": "Casa"})
    assert r.status_code == 201, r.text
    otro = await _otro_usuario(api, f"pareja-{gid[:6]}")
    r = await api.client.post(
        f"/api/v1/groups/{gid}/members", json={"username": f"pareja-{gid[:6]}"}
    )
    assert r.status_code == 201, r.text
    return gid, otro


async def _categoria(api: SimpleNamespace, *, grupo: str | None, kind: str = "expense") -> str:
    """Una categoria del grupo (las siembra el grupo) o una personal nueva."""
    if grupo:
        fila = await api.session.execute(
            text(
                "SELECT id FROM categories WHERE group_id = :g AND kind = :k "
                "AND deleted_at IS NULL LIMIT 1"
            ),
            {"g": grupo, "k": kind},
        )
        return str(fila.scalar_one())
    cid = str(uuid.uuid4())
    r = await api.client.post(
        "/api/v1/categories", json={"id": cid, "name": f"Cat {cid[:4]}", "kind": kind}
    )
    assert r.status_code == 201, r.text
    return cid


async def _cuenta(api: SimpleNamespace, **over) -> str:
    datos = {"id": str(uuid.uuid4()), "name": "Banco", "type": "bank", "currency": "ARS"}
    datos.update(over)
    r = await api.client.post("/api/v1/accounts", json=datos)
    assert r.status_code == 201, r.text
    return datos["id"]


def _plantilla(**over) -> dict:
    datos = {"id": str(uuid.uuid4()), "name": "Expensas", "kind": "expense"}
    datos.update(over)
    return datos


@contextmanager
def _como(uid: str) -> Iterator[None]:
    """Las rutas, como otra persona."""
    antes = app.dependency_overrides[get_current_user_id]
    app.dependency_overrides[get_current_user_id] = lambda: uuid.UUID(uid)
    try:
        yield
    finally:
        app.dependency_overrides[get_current_user_id] = antes


# --- De grupo ----------------------------------------------------------------------


async def test_una_plantilla_del_grupo(api: SimpleNamespace) -> None:
    gid, _ = await _grupo_con_miembro(api)
    cat = await _categoria(api, grupo=gid)
    r = await api.client.post(
        "/api/v1/templates",
        json=_plantilla(group_id=gid, category_id=cat, amount=4500000, currency="ARS"),
    )
    assert r.status_code == 201, r.text
    assert r.json()["group_id"] == gid
    assert (await api.fila("templates", r.json()["id"]))["category_id"] == cat


async def test_de_un_grupo_ajeno_no(api: SimpleNamespace) -> None:
    ajeno = await _otro_usuario(api, "ajeno")
    gid = str(uuid.uuid4())
    with _como(ajeno):
        assert (
            await api.client.post("/api/v1/groups", json={"id": gid, "name": "Ajeno"})
        ).status_code == 201
    r = await api.client.post("/api/v1/templates", json=_plantilla(group_id=gid))
    assert r.status_code == 422
    assert "grupo" in r.json()["detail"]


async def test_la_del_grupo_es_de_gasto_sin_cuenta_y_con_su_categoria(
    api: SimpleNamespace,
) -> None:
    gid, _ = await _grupo_con_miembro(api)
    personal = await _categoria(api, grupo=None)
    cuenta = await _cuenta(api)
    malas = [
        _plantilla(group_id=gid, kind="income"),
        _plantilla(group_id=gid, account_id=cuenta),
        _plantilla(group_id=gid, category_id=personal),
    ]
    for datos in malas:
        r = await api.client.post("/api/v1/templates", json=datos)
        assert r.status_code == 422, datos


async def test_cualquier_miembro_la_edita_o_la_borra(api: SimpleNamespace) -> None:
    """G4: como las categorias del grupo."""
    gid, otro = await _grupo_con_miembro(api)
    r = await api.client.post("/api/v1/templates", json=_plantilla(group_id=gid))
    tid = r.json()["id"]
    with _como(otro):
        r = await api.client.patch(f"/api/v1/templates/{tid}", json={"name": "Expensas Casa"})
        assert r.status_code == 200, r.text
        assert r.json()["name"] == "Expensas Casa"
        assert (await api.client.delete(f"/api/v1/templates/{tid}")).status_code == 204
    assert (await api.fila("templates", tid))["deleted_at"] is not None


async def test_quien_no_es_del_grupo_no_la_toca(api: SimpleNamespace) -> None:
    gid, _ = await _grupo_con_miembro(api)
    tid = (await api.client.post("/api/v1/templates", json=_plantilla(group_id=gid))).json()["id"]
    ajeno = await _otro_usuario(api, "ajeno2")
    with _como(ajeno):
        r = await api.client.patch(f"/api/v1/templates/{tid}", json={"name": "X"})
        assert r.status_code == 404


async def test_un_recordatorio_personal_no_usa_una_del_grupo(api: SimpleNamespace) -> None:
    gid, _ = await _grupo_con_miembro(api)
    tid = (await api.client.post("/api/v1/templates", json=_plantilla(group_id=gid))).json()["id"]
    r = await api.client.post(
        "/api/v1/reminders",
        json={
            "id": str(uuid.uuid4()),
            "title": "Expensas",
            "freq": "once",
            "start_date": "2026-11-10",
            "weekend_shift": "none",
            "track_from": "2026-10-09",
            "template_id": tid,
        },
    )
    assert r.status_code == 201
    assert r.json()["template_id"] is None


# --- Personales: la validacion que faltaba ----------------------------------------


async def test_una_personal_con_lo_suyo(api: SimpleNamespace) -> None:
    cat = await _categoria(api, grupo=None)
    cuenta = await _cuenta(api)
    r = await api.client.post(
        "/api/v1/templates", json=_plantilla(category_id=cat, account_id=cuenta)
    )
    assert r.status_code == 201, r.text
    assert r.json()["group_id"] is None


async def test_una_personal_no_lleva_lo_del_grupo_ni_lo_ajeno(api: SimpleNamespace) -> None:
    gid, _ = await _grupo_con_miembro(api)
    del_grupo = await _categoria(api, grupo=gid)
    ingreso = await _categoria(api, grupo=None, kind="income")
    conjunta = await _cuenta(api, group_id=gid, name="Caja común")
    malas = [
        _plantilla(category_id=del_grupo),
        # Un gasto con una categoria de ingreso.
        _plantilla(category_id=ingreso),
        _plantilla(kind="transfer", category_id=await _categoria(api, grupo=None)),
        _plantilla(account_id=conjunta),
        _plantilla(account_id=str(uuid.uuid4())),
        _plantilla(payment_method_id=str(uuid.uuid4())),
    ]
    for datos in malas:
        r = await api.client.post("/api/v1/templates", json=datos)
        # 422 y no 409: el 409 lo toma el conector por "ya aplicado" y se perdia.
        assert r.status_code == 422, datos


async def test_editar_valida_solo_lo_que_cambia(api: SimpleNamespace) -> None:
    """Una plantilla vieja que no cumple (de antes de validar) no traba otro
    cambio; lo que cambia, si se valida."""
    gid, _ = await _grupo_con_miembro(api)
    del_grupo = await _categoria(api, grupo=gid)
    tid = str(uuid.uuid4())
    await api.session.execute(
        text(
            "INSERT INTO templates (id, owner_id, name, kind, category_id) "
            "VALUES (:id, :u, 'Vieja', 'expense', :c)"
        ),
        {"id": tid, "u": str(api.owner_id), "c": del_grupo},
    )
    await api.session.flush()
    r = await api.client.patch(f"/api/v1/templates/{tid}", json={"amount": 1000})
    assert r.status_code == 200, r.text
    r = await api.client.patch(f"/api/v1/templates/{tid}", json={"category_id": del_grupo})
    assert r.status_code == 422
