"""Recurrentes y metas de un grupo (1.15.0): las mismas que las personales, de a
varios. La recurrente la paga y la edita solo quien la creo; la meta va con una
cuenta conjunta y la edita cualquier miembro."""

import uuid
from types import SimpleNamespace

from tests.api.test_templates_grupo import _categoria, _como, _cuenta, _grupo_con_miembro


def _regla(**over) -> dict:
    datos = {
        "id": str(uuid.uuid4()),
        "name": "Alquiler",
        "kind": "expense",
        "amount": 50_000_000_000_00,
        "currency": "ARS",
        "frequency": "monthly",
        "start_date": "2026-11-01",
        "next_run_date": "2026-11-01",
    }
    datos.update(over)
    return datos


def _meta(**over) -> dict:
    datos = {
        "id": str(uuid.uuid4()),
        "name": "Vacaciones",
        "target_amount": 90_000_000_000_00,
        "currency": "ARS",
    }
    datos.update(over)
    return datos


# --- Recurrentes -------------------------------------------------------------------


async def test_una_recurrente_del_grupo(api: SimpleNamespace) -> None:
    gid, _ = await _grupo_con_miembro(api)
    cat = await _categoria(api, grupo=gid)
    cuenta = await _cuenta(api)
    r = await api.client.post(
        "/api/v1/recurring", json=_regla(group_id=gid, category_id=cat, account_id=cuenta)
    )
    assert r.status_code == 201, r.text
    assert r.json()["group_id"] == gid
    # Sin perder precision en un monto grande.
    assert r.json()["amount"] == 50_000_000_000_00


async def test_la_recurrente_del_grupo_puede_pagarla_la_conjunta(api: SimpleNamespace) -> None:
    gid, _ = await _grupo_con_miembro(api)
    cat = await _categoria(api, grupo=gid)
    conjunta = await _cuenta(api, group_id=gid)
    r = await api.client.post(
        "/api/v1/recurring", json=_regla(group_id=gid, category_id=cat, account_id=conjunta)
    )
    assert r.status_code == 201, r.text


async def test_la_recurrente_del_grupo_se_valida(api: SimpleNamespace) -> None:
    gid, _ = await _grupo_con_miembro(api)
    cat_grupo = await _categoria(api, grupo=gid)
    cat_mia = await _categoria(api, grupo=None)
    cuenta = await _cuenta(api)
    otro_gid, _ = await _grupo_con_miembro(api)
    otra_conjunta = await _cuenta(api, group_id=otro_gid)

    casos = [
        # Una categoria personal en un gasto del grupo.
        _regla(group_id=gid, category_id=cat_mia, account_id=cuenta),
        # Solo gastos.
        _regla(
            group_id=gid,
            kind="transfer",
            account_id=cuenta,
            transfer_account_id=await _cuenta(api),
        ),
        # La conjunta de OTRO grupo.
        _regla(group_id=gid, category_id=cat_grupo, account_id=otra_conjunta),
        # Una personal con la categoria del grupo.
        _regla(category_id=cat_grupo, account_id=cuenta),
    ]
    for datos in casos:
        r = await api.client.post("/api/v1/recurring", json=datos)
        assert r.status_code == 422, (datos, r.text)


async def test_la_recurrente_de_un_grupo_ajeno_no_va(api: SimpleNamespace) -> None:
    gid, otro = await _grupo_con_miembro(api)
    cat = await _categoria(api, grupo=gid)
    with _como(otro):
        cuenta_otro = await _cuenta(api)
    # Un grupo que no existe (o del que no soy miembro).
    r = await api.client.post(
        "/api/v1/recurring",
        json=_regla(group_id=str(uuid.uuid4()), category_id=cat, account_id=await _cuenta(api)),
    )
    assert r.status_code == 422
    # La cuenta de otro miembro: no es mia.
    r = await api.client.post(
        "/api/v1/recurring", json=_regla(group_id=gid, category_id=cat, account_id=cuenta_otro)
    )
    assert r.status_code == 422


async def test_la_recurrente_del_grupo_la_edita_solo_quien_la_creo(api: SimpleNamespace) -> None:
    gid, otro = await _grupo_con_miembro(api)
    cat = await _categoria(api, grupo=gid)
    datos = _regla(group_id=gid, category_id=cat, account_id=await _cuenta(api))
    assert (await api.client.post("/api/v1/recurring", json=datos)).status_code == 201
    with _como(otro):
        r = await api.client.patch(f"/api/v1/recurring/{datos['id']}", json={"active": False})
        assert r.status_code == 404
        r = await api.client.delete(f"/api/v1/recurring/{datos['id']}")
        assert r.status_code == 404
    r = await api.client.patch(f"/api/v1/recurring/{datos['id']}", json={"active": False})
    assert r.status_code == 200, r.text


# --- Metas -------------------------------------------------------------------------


async def test_una_meta_del_grupo_con_la_conjunta(api: SimpleNamespace) -> None:
    gid, otro = await _grupo_con_miembro(api)
    conjunta = await _cuenta(api, group_id=gid)
    datos = _meta(group_id=gid, account_id=conjunta)
    r = await api.client.post("/api/v1/goals", json=datos)
    assert r.status_code == 201, r.text
    assert r.json()["group_id"] == gid
    assert r.json()["target_amount"] == 90_000_000_000_00
    # La edita y la borra cualquier miembro.
    with _como(otro):
        r = await api.client.patch(f"/api/v1/goals/{datos['id']}", json={"name": "Viaje"})
        assert r.status_code == 200, r.text
        assert r.json()["name"] == "Viaje"
        r = await api.client.delete(f"/api/v1/goals/{datos['id']}")
        assert r.status_code == 204


async def test_la_meta_del_grupo_va_con_una_conjunta_del_grupo(api: SimpleNamespace) -> None:
    gid, _ = await _grupo_con_miembro(api)
    mia = await _cuenta(api)
    otro_gid, _ = await _grupo_con_miembro(api)
    otra_conjunta = await _cuenta(api, group_id=otro_gid)
    for cuenta in (mia, otra_conjunta):
        r = await api.client.post("/api/v1/goals", json=_meta(group_id=gid, account_id=cuenta))
        assert r.status_code == 422, r.text
    # Sin cuenta todavia, como una personal.
    datos = _meta(group_id=gid)
    assert (await api.client.post("/api/v1/goals", json=datos)).status_code == 201
    # Y al editar tampoco se le pone una cuenta personal.
    r = await api.client.patch(f"/api/v1/goals/{datos['id']}", json={"account_id": mia})
    assert r.status_code == 422


async def test_la_meta_de_un_grupo_ajeno_no_se_ve(api: SimpleNamespace) -> None:
    gid, otro = await _grupo_con_miembro(api)
    r = await api.client.post("/api/v1/goals", json=_meta(group_id=str(uuid.uuid4())))
    assert r.status_code == 422
    # Una meta personal mia no la toca otro miembro del grupo.
    datos = _meta()
    assert (await api.client.post("/api/v1/goals", json=datos)).status_code == 201
    with _como(otro):
        r = await api.client.patch(f"/api/v1/goals/{datos['id']}", json={"name": "X"})
        assert r.status_code == 404
