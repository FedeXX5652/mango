"""Como se llama cada miembro en un grupo (1.12.1, 0035): cada uno edita el suyo,
lo ve todo el grupo, y los avisos del grupo lo nombran asi."""

import uuid
from datetime import timedelta
from types import SimpleNamespace

from sqlalchemy import text

from app.services import aviso_grupos
from tests.api.test_aviso_grupos import _avisos, _cat_grupo, _gasto, _grupo, _llegada


def _alias(gid: str) -> str:
    return f"/api/v1/groups/{gid}/members/me"


async def _alias_de(api: SimpleNamespace, gid: str, uid: str | uuid.UUID) -> str | None:
    return (
        await api.session.execute(
            text("SELECT alias FROM group_members WHERE group_id = :g AND user_id = :u"),
            {"g": gid, "u": str(uid)},
        )
    ).scalar_one()


async def test_cada_uno_pone_su_nombre_en_el_grupo(api: SimpleNamespace) -> None:
    gid, _ = await _grupo(api, "pareja")
    r = await api.client.patch(_alias(gid), json={"alias": "  Fefi  "})
    assert r.status_code == 200, r.text
    assert r.json()["alias"] == "Fefi"
    assert await _alias_de(api, gid, api.owner_id) == "Fefi"


async def test_es_por_grupo(api: SimpleNamespace) -> None:
    casa, _ = await _grupo(api, "pareja")
    viaje, _ = await _grupo(api, "amigo")
    await api.client.patch(_alias(casa), json={"alias": "Fefi"})
    assert await _alias_de(api, viaje, api.owner_id) is None


async def test_vacio_vuelve_al_nombre_de_mango(api: SimpleNamespace) -> None:
    gid, _ = await _grupo(api)
    await api.client.patch(_alias(gid), json={"alias": "Fefi"})
    for vacio in ("   ", "", None):
        r = await api.client.patch(_alias(gid), json={"alias": vacio})
        assert r.status_code == 200, r.text
        assert await _alias_de(api, gid, api.owner_id) is None


async def test_largo_maximo(api: SimpleNamespace) -> None:
    gid, _ = await _grupo(api)
    assert (await api.client.patch(_alias(gid), json={"alias": "a" * 40})).status_code == 200
    r = await api.client.patch(_alias(gid), json={"alias": "a" * 41})
    assert r.status_code == 422
    assert "40" in r.json()["detail"]


async def test_no_repite_el_nombre_de_otro_miembro(api: SimpleNamespace) -> None:
    gid, [pareja] = await _grupo(api, "pareja")
    nombre_pareja = (await api.fila("users", pareja))["display_name"]
    r = await api.client.patch(_alias(gid), json={"alias": nombre_pareja.upper()})
    assert r.status_code == 422
    assert "ya se llama así" in r.json()["detail"]
    # Tampoco el alias que otro ya eligio.
    await api.session.execute(
        text("UPDATE group_members SET alias = 'Beto' WHERE group_id = :g AND user_id = :u"),
        {"g": gid, "u": pareja},
    )
    assert (await api.client.patch(_alias(gid), json={"alias": "beto"})).status_code == 422


async def test_quien_no_es_del_grupo_recibe_404(api: SimpleNamespace) -> None:
    r = await api.client.patch(_alias(str(uuid.uuid4())), json={"alias": "Fefi"})
    assert r.status_code == 404


async def test_los_avisos_del_grupo_usan_el_alias(api: SimpleNamespace) -> None:
    gid, [pareja] = await _grupo(api, "pareja")
    await api.client.patch(_alias(gid), json={"alias": "Fefi"})
    tx = await _gasto(api, gid, await _cat_grupo(api, gid), 10000)
    await aviso_grupos.avisar(api.session, await _llegada(api, tx) + timedelta(minutes=2))

    [aviso] = await _avisos(api, pareja, "gasto_compartido")
    assert aviso["body"].startswith("Fefi cargó $100,00")
