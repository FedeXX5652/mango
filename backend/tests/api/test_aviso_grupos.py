"""Avisos del grupo que arma el planificador (1.7.0, ver 0019): un gasto
compartido nuevo y un tope del grupo superado."""

import uuid
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

from sqlalchemy import text

from app.services import aviso_grupos


async def _otro_usuario(api: SimpleNamespace, username: str) -> str:
    uid = str(uuid.uuid4())
    await api.session.execute(
        text(
            "INSERT INTO users (id, username, password_hash, display_name) "
            "VALUES (:id, :u, '!', :u)"
        ),
        {"id": uid, "u": f"{username}-{uid[:6]}"},
    )
    await api.session.flush()
    return uid


async def _grupo(api: SimpleNamespace, *miembros: str) -> tuple[str, list[str]]:
    """Grupo del usuario de la prueba con mas miembros. Devuelve (id, ids)."""
    gid = str(uuid.uuid4())
    assert (
        await api.client.post("/api/v1/groups", json={"id": gid, "name": "Casa"})
    ).status_code == 201
    ids = []
    for nombre in miembros:
        uid = await _otro_usuario(api, nombre)
        username = (await api.fila("users", uid))["username"]
        r = await api.client.post(f"/api/v1/groups/{gid}/members", json={"username": username})
        assert r.status_code == 201, r.text
        ids.append(uid)
    return gid, ids


async def _cat_grupo(api: SimpleNamespace, gid: str) -> str:
    r = await api.client.post(
        "/api/v1/categories",
        json={"id": str(uuid.uuid4()), "name": "Super", "kind": "expense", "group_id": gid},
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def _gasto(
    api: SimpleNamespace,
    gid: str,
    cat: str,
    monto: int,
    *,
    moneda: str = "ARS",
    cuando: datetime | None = None,
    comercio: str | None = "Chino",
) -> str:
    acc = (
        await api.client.post(
            "/api/v1/accounts",
            json={"id": str(uuid.uuid4()), "name": "Cta", "type": "cash", "currency": moneda},
        )
    ).json()["id"]
    r = await api.client.post(
        "/api/v1/transactions",
        json={
            "id": str(uuid.uuid4()),
            "kind": "expense",
            "occurred_at": (cuando or datetime.now(UTC)).isoformat(),
            "amount": monto,
            "currency": moneda,
            "account_id": acc,
            "category_id": cat,
            "payee": comercio,
            "visibility": "shared",
            "group_id": gid,
        },
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def _parte(api: SimpleNamespace, tx: str, uid: str, monto: int) -> None:
    r = await api.client.post(
        "/api/v1/transaction-splits",
        json={"id": str(uuid.uuid4()), "transaction_id": tx, "user_id": uid, "amount": monto},
    )
    assert r.status_code == 201, r.text


async def _llegada(api: SimpleNamespace, tx: str) -> datetime:
    """Cuando llego el movimiento al servidor (en la prueba, el comienzo de la
    transaccion de la base: `now()` no avanza)."""
    return (
        await api.session.execute(
            text("SELECT created_at FROM transactions WHERE id = :id"), {"id": tx}
        )
    ).scalar_one()


async def _avisos(api: SimpleNamespace, uid: str | uuid.UUID, tipo: str) -> list[dict]:
    rows = await api.session.execute(
        text(
            "SELECT title, body, link, meta FROM notifications "
            "WHERE user_id = :u AND type = :t ORDER BY created_at"
        ),
        {"u": str(uid), "t": tipo},
    )
    return [dict(r) for r in rows.mappings().all()]


# --- Gasto compartido nuevo -------------------------------------------------------


async def test_gasto_en_partes_iguales_avisa_a_los_demas(api: SimpleNamespace) -> None:
    gid, [pareja] = await _grupo(api, "pareja")
    tx = await _gasto(api, gid, await _cat_grupo(api, gid), 1234567)
    await aviso_grupos.avisar(api.session, await _llegada(api, tx) + timedelta(minutes=2))

    [aviso] = await _avisos(api, pareja, "gasto_compartido")
    assert aviso["title"] == "Casa · Gasto nuevo"
    assert aviso["body"] == "Test cargó $12.345,67 en Chino. Se reparte en partes iguales."
    assert aviso["link"] == f"/grupos/{gid}/movimientos/{tx}"
    # Quien lo cargo no se avisa a si mismo.
    assert await _avisos(api, api.owner_id, "gasto_compartido") == []


async def test_no_repite_el_aviso(api: SimpleNamespace) -> None:
    gid, [pareja] = await _grupo(api, "pareja")
    tx = await _gasto(api, gid, await _cat_grupo(api, gid), 1000)
    llegada = await _llegada(api, tx)
    await aviso_grupos.avisar(api.session, llegada + timedelta(minutes=2))
    await aviso_grupos.avisar(api.session, llegada + timedelta(minutes=3))
    assert len(await _avisos(api, pareja, "gasto_compartido")) == 1


async def test_espera_a_que_lleguen_las_partes(api: SimpleNamespace) -> None:
    # Recien llegado el movimiento no se sabe a quien le toca: todavia no avisa.
    gid, [pareja] = await _grupo(api, "pareja")
    tx = await _gasto(api, gid, await _cat_grupo(api, gid), 1000)
    await aviso_grupos.avisar(api.session, await _llegada(api, tx) + timedelta(seconds=10))
    assert await _avisos(api, pareja, "gasto_compartido") == []


async def test_con_partes_avisa_solo_a_quien_le_toca(api: SimpleNamespace) -> None:
    gid, [pareja, tercero] = await _grupo(api, "pareja", "tercero")
    tx = await _gasto(api, gid, await _cat_grupo(api, gid), 10000, comercio=None)
    await _parte(api, tx, str(api.owner_id), 7000)
    await _parte(api, tx, pareja, 3000)
    await _parte(api, tx, tercero, 0)
    await aviso_grupos.avisar(api.session, await _llegada(api, tx) + timedelta(minutes=2))

    [aviso] = await _avisos(api, pareja, "gasto_compartido")
    # Sin comercio, dice la categoria.
    assert aviso["body"] == "Test cargó $100,00 en Super. Te toca $30,00."
    assert await _avisos(api, tercero, "gasto_compartido") == []


async def test_un_gasto_que_llego_hace_rato_no_es_nuevo(api: SimpleNamespace) -> None:
    gid, [pareja] = await _grupo(api, "pareja")
    tx = await _gasto(api, gid, await _cat_grupo(api, gid), 1000)
    await aviso_grupos.avisar(api.session, await _llegada(api, tx) + timedelta(hours=2))
    assert await _avisos(api, pareja, "gasto_compartido") == []


async def test_un_ex_miembro_no_recibe_el_aviso(api: SimpleNamespace) -> None:
    gid, [pareja] = await _grupo(api, "pareja")
    tx = await _gasto(api, gid, await _cat_grupo(api, gid), 1000)
    r = await api.client.delete(f"/api/v1/groups/{gid}/members/{pareja}")
    assert r.status_code == 204
    await aviso_grupos.avisar(api.session, await _llegada(api, tx) + timedelta(minutes=2))
    assert await _avisos(api, pareja, "gasto_compartido") == []


# --- Tope del grupo superado ------------------------------------------------------


async def _tope(api: SimpleNamespace, gid: str, cat: str, monto: int, ahora: datetime) -> str:
    bid = str(uuid.uuid4())
    mes = aviso_grupos._mes(ahora)[0].date()
    r = await api.client.post(
        "/api/v1/budgets",
        json={
            "id": bid,
            "group_id": gid,
            "category_id": cat,
            "period_start": mes.isoformat(),
            "amount": monto,
            "currency": "ARS",
        },
    )
    assert r.status_code == 201, r.text
    return bid


async def test_pasar_el_tope_avisa_una_vez_a_todos(api: SimpleNamespace) -> None:
    ahora = datetime.now(UTC)
    gid, [pareja] = await _grupo(api, "pareja")
    cat = await _cat_grupo(api, gid)
    bid = await _tope(api, gid, cat, 5000, ahora)
    await _gasto(api, gid, cat, 4000, cuando=ahora)
    await aviso_grupos.avisar(api.session, ahora)
    # Todavia no lo paso.
    assert await _avisos(api, pareja, "presupuesto_excedido") == []

    await _gasto(api, gid, cat, 1500, cuando=ahora)
    await aviso_grupos.avisar(api.session, ahora)
    await aviso_grupos.avisar(api.session, ahora)
    for uid in (pareja, api.owner_id):
        [aviso] = await _avisos(api, uid, "presupuesto_excedido")
        assert aviso["title"] == "Casa · Se pasaron del tope en Super"
        assert aviso["body"] == "Llevan $55,00 de $50,00 este mes."
        assert aviso["link"] == f"/grupos/{gid}/presupuesto"
        assert aviso["meta"] == {"budget_id": bid}


async def test_un_gasto_en_otra_moneda_no_cuenta_para_el_tope(api: SimpleNamespace) -> None:
    # El tope es de una moneda (0005): un gasto en dolares no lo llena.
    ahora = datetime.now(UTC)
    gid, [pareja] = await _grupo(api, "pareja")
    cat = await _cat_grupo(api, gid)
    await _tope(api, gid, cat, 5000, ahora)
    await _gasto(api, gid, cat, 9000, moneda="USD", cuando=ahora)
    await aviso_grupos.avisar(api.session, ahora)
    assert await _avisos(api, pareja, "presupuesto_excedido") == []


async def test_un_gasto_de_otro_mes_no_cuenta(api: SimpleNamespace) -> None:
    ahora = datetime.now(UTC)
    gid, [pareja] = await _grupo(api, "pareja")
    cat = await _cat_grupo(api, gid)
    await _tope(api, gid, cat, 5000, ahora)
    await _gasto(api, gid, cat, 9000, cuando=aviso_grupos._mes(ahora)[0] - timedelta(days=1))
    await aviso_grupos.avisar(api.session, ahora)
    assert await _avisos(api, pareja, "presupuesto_excedido") == []
