"""Pagos en conjunto (1.8.0, ver 0032): quien mas puso plata en un gasto
compartido, el pago a confirmar de cada uno y sus avisos."""

import uuid
from contextlib import contextmanager
from datetime import timedelta
from types import SimpleNamespace

from sqlalchemy import text

from app.api.deps import get_current_user_id
from app.main import app
from app.services import aviso_grupos


async def _usuario(api: SimpleNamespace, nombre: str) -> str:
    uid = str(uuid.uuid4())
    await api.session.execute(
        text(
            "INSERT INTO users (id, username, password_hash, display_name) "
            "VALUES (:id, :u, '!', :n)"
        ),
        {"id": uid, "u": f"{nombre}-{uid[:6]}", "n": nombre},
    )
    await api.session.flush()
    return uid


@contextmanager
def como(uid: str):
    """Las llamadas de adentro las hace otro usuario."""
    antes = app.dependency_overrides[get_current_user_id]
    app.dependency_overrides[get_current_user_id] = lambda: uuid.UUID(uid)
    try:
        yield
    finally:
        app.dependency_overrides[get_current_user_id] = antes


async def _post(api, ruta: str, cuerpo: dict, esperado: int = 201) -> dict:
    r = await api.client.post(f"/api/v1/{ruta}", json=cuerpo)
    assert r.status_code == esperado, r.text
    return r.json()


async def _cuenta(api, nombre="Cta", **extra) -> str:
    return (
        await _post(
            api,
            "accounts",
            {"id": str(uuid.uuid4()), "name": nombre, "type": "cash", "currency": "ARS", **extra},
        )
    )["id"]


async def _escena(api) -> SimpleNamespace:
    """Grupo con el usuario de la prueba (Test) y Beto; un gasto de $100 que
    Test cargo y en el que puso $40."""
    gid = str(uuid.uuid4())
    await _post(api, "groups", {"id": gid, "name": "Casa"})
    beto = await _usuario(api, "Beto")
    username = (await api.fila("users", beto))["username"]
    await _post(api, f"groups/{gid}/members", {"username": username})
    cat = (
        await _post(
            api,
            "categories",
            {"id": str(uuid.uuid4()), "name": "Super", "kind": "expense", "group_id": gid},
        )
    )["id"]
    cta = await _cuenta(api)
    tx = (
        await _post(
            api,
            "transactions",
            {
                "id": str(uuid.uuid4()),
                "kind": "expense",
                "occurred_at": "2026-10-19T12:00:00-03:00",
                "amount": 10000,
                "amount_owner": 4000,
                "currency": "ARS",
                "account_id": cta,
                "category_id": cat,
                "payee": "Chino",
                "visibility": "shared",
                "group_id": gid,
            },
        )
    )["id"]
    return SimpleNamespace(gid=gid, beto=beto, cat=cat, cta=cta, tx=tx)


async def _pago(api, e, monto=6000) -> str:
    return (
        await _post(
            api,
            "transaction-payers",
            {"id": str(uuid.uuid4()), "transaction_id": e.tx, "user_id": e.beto, "amount": monto},
        )
    )["id"]


async def _avisos(api, uid: str, tipo: str) -> list[dict]:
    rows = await api.session.execute(
        text("SELECT title, body, meta FROM notifications WHERE user_id = :u AND type = :t"),
        {"u": uid, "t": tipo},
    )
    return [dict(r) for r in rows.mappings().all()]


async def test_lo_que_puso_otro_le_llega_como_pago_a_confirmar(api) -> None:
    e = await _escena(api)
    pid = await _pago(api, e)
    fila = await api.fila("transaction_payers", pid)
    assert fila["status"] == "pending"
    # Su movimiento, con el mismo id: pendiente, sin cuenta, apuntando al gasto.
    pago = await api.fila("transactions", pid)
    assert pago["owner_id"] == e.beto
    assert (pago["amount"], pago["status"], pago["account_id"]) == (6000, "pending", None)
    assert pago["pending_reason"] == "pago_a_confirmar"
    assert pago["paid_for_id"] == e.tx
    [aviso] = await _avisos(api, e.beto, "pago_por_confirmar")
    assert aviso["body"] == (
        "Test cargó $100,00 en Chino: pusiste $60,00. Confirmá de qué cuenta salió."
    )


async def test_confirmar_eligiendo_la_cuenta(api) -> None:
    e = await _escena(api)
    pid = await _pago(api, e)
    with como(e.beto):
        cta_beto = await _cuenta(api, "De Beto")
        r = await api.client.patch(
            f"/api/v1/transactions/{pid}", json={"status": "confirmed", "account_id": cta_beto}
        )
        assert r.status_code == 200, r.text
        # De su parte solo se elige la cuenta y la respuesta: el monto no.
        r = await api.client.patch(f"/api/v1/transactions/{pid}", json={"amount": 1})
        assert r.status_code == 422
        # Y no se borra: se responde.
        assert (await api.client.delete(f"/api/v1/transactions/{pid}")).status_code == 422
    assert (await api.fila("transaction_payers", pid))["status"] == "confirmed"


async def test_no_la_pague_avisa_despues_del_rato_para_deshacer(api) -> None:
    e = await _escena(api)
    pid = await _pago(api, e)
    with como(e.beto):
        r = await api.client.patch(f"/api/v1/transactions/{pid}", json={"status": "rejected"})
        assert r.status_code == 200, r.text
    fila = await api.fila("transaction_payers", pid)
    assert fila["status"] == "rejected"
    desde = (
        await api.session.execute(
            text("SELECT updated_at FROM transaction_payers WHERE id = :i"), {"i": pid}
        )
    ).scalar_one()
    # Deshacer vuelve a pendiente; rechazar de nuevo arranca otro rato.
    with como(e.beto):
        r = await api.client.patch(f"/api/v1/transactions/{pid}", json={"status": "pending"})
        assert r.status_code == 200, r.text
        assert (await api.fila("transaction_payers", pid))["status"] == "pending"
        await api.client.patch(f"/api/v1/transactions/{pid}", json={"status": "rejected"})
    # Dentro del rato para deshacer, nada.
    await aviso_grupos.avisar(api.session, desde + timedelta(seconds=10))
    assert await _avisos(api, str(api.owner_id), "pago_rechazado") == []
    await aviso_grupos.avisar(api.session, desde + timedelta(seconds=40))
    await aviso_grupos.avisar(api.session, desde + timedelta(seconds=50))
    [aviso] = await _avisos(api, str(api.owner_id), "pago_rechazado")
    assert aviso["body"] == "Beto dice que no puso $60,00 en Chino. Revisá el gasto."


async def test_rechazar_solo_se_puede_en_un_pago_a_confirmar(api) -> None:
    e = await _escena(api)
    r = await api.client.patch(f"/api/v1/transactions/{e.tx}", json={"status": "rejected"})
    assert r.status_code == 422
    r = await api.client.patch(f"/api/v1/transactions/{e.tx}", json={"status": "pending"})
    assert r.status_code == 422


async def test_si_cambia_lo_que_puso_se_vuelve_a_confirmar(api) -> None:
    # Q1: ya confirmado, quien cargo cambia el monto: vuelve a pendiente.
    e = await _escena(api)
    pid = await _pago(api, e)
    with como(e.beto):
        cta_beto = await _cuenta(api, "De Beto")
        await api.client.patch(
            f"/api/v1/transactions/{pid}", json={"status": "confirmed", "account_id": cta_beto}
        )
    r = await api.client.patch(f"/api/v1/transaction-payers/{pid}", json={"amount": 5000})
    assert r.status_code == 200, r.text
    pago = await api.fila("transactions", pid)
    assert (pago["amount"], pago["status"]) == (5000, "pending")
    assert (await api.fila("transaction_payers", pid))["status"] == "pending"
    assert len(await _avisos(api, e.beto, "pago_cambiado")) == 1


async def test_borrar_el_gasto_borra_los_pagos(api) -> None:
    # Q2: confirmado o no, el pago se va con el gasto.
    e = await _escena(api)
    pid = await _pago(api, e)
    assert (await api.client.delete(f"/api/v1/transactions/{e.tx}")).status_code == 204
    assert (await api.fila("transaction_payers", pid))["deleted_at"] is not None
    assert (await api.fila("transactions", pid))["deleted_at"] is not None
    assert len(await _avisos(api, e.beto, "pago_borrado")) == 1


async def test_sacar_a_uno_de_los_que_pagaron(api) -> None:
    e = await _escena(api)
    pid = await _pago(api, e)
    assert (await api.client.delete(f"/api/v1/transaction-payers/{pid}")).status_code == 204
    assert (await api.fila("transactions", pid))["deleted_at"] is not None
    # Idempotente.
    assert (await api.client.delete(f"/api/v1/transaction-payers/{pid}")).status_code == 204


async def test_la_cuenta_conjunta_pone_sin_confirmar(api) -> None:
    e = await _escena(api)
    conjunta = await _cuenta(api, "Conjunta", group_id=e.gid)
    p = await _post(
        api,
        "transaction-payers",
        {"id": str(uuid.uuid4()), "transaction_id": e.tx, "account_id": conjunta, "amount": 6000},
    )
    assert p["status"] == "confirmed"
    # No es un movimiento de nadie.
    assert await api.fila("transactions", p["id"]) is None
    # Una cuenta personal no es la conjunta.
    otra = await _cuenta(api, "Mia")
    await _post(
        api,
        "transaction-payers",
        {"id": str(uuid.uuid4()), "transaction_id": e.tx, "account_id": otra, "amount": 1},
        esperado=422,
    )


async def test_validaciones_de_quien_pago(api) -> None:
    e = await _escena(api)
    ajeno = await _usuario(api, "Ajeno")
    base = {"transaction_id": e.tx, "amount": 1}
    # No es miembro; es quien lo cargo; las dos cosas a la vez.
    for extra in ({"user_id": ajeno}, {"user_id": str(api.owner_id)}):
        await _post(api, "transaction-payers", {"id": str(uuid.uuid4()), **base, **extra}, 422)
    await _post(
        api,
        "transaction-payers",
        {"id": str(uuid.uuid4()), **base, "user_id": e.beto, "account_id": e.cta},
        422,
    )
    # Solo quien cargo el gasto los carga.
    with como(e.beto):
        await _post(
            api, "transaction-payers", {"id": str(uuid.uuid4()), **base, "user_id": e.beto}, 422
        )


async def test_lo_pagaron_otros_enteros_no_hace_falta_cuenta(api) -> None:
    e = await _escena(api)
    r = await _post(
        api,
        "transactions",
        {
            "id": str(uuid.uuid4()),
            "kind": "expense",
            "occurred_at": "2026-10-19T12:00:00-03:00",
            "amount": 5000,
            "amount_owner": 0,
            "currency": "ARS",
            "category_id": e.cat,
            "visibility": "shared",
            "group_id": e.gid,
        },
    )
    assert r["account_id"] is None
    # Sin `amount_owner` 0 la cuenta sigue siendo obligatoria.
    r2 = await api.client.post(
        "/api/v1/transactions",
        json={
            "id": str(uuid.uuid4()),
            "kind": "expense",
            "occurred_at": "2026-10-19T12:00:00-03:00",
            "amount": 5000,
            "currency": "ARS",
            "category_id": e.cat,
            "visibility": "shared",
            "group_id": e.gid,
        },
    )
    assert r2.status_code == 422


async def test_lo_mio_no_mas_que_el_total_y_solo_compartido(api) -> None:
    e = await _escena(api)
    r = await api.client.patch(f"/api/v1/transactions/{e.tx}", json={"amount_owner": 20000})
    assert r.status_code == 422
    pid = await _pago(api, e)
    # Con otros que pagaron no puede dejar de ser compartido.
    r = await api.client.patch(f"/api/v1/transactions/{e.tx}", json={"visibility": "private"})
    assert r.status_code == 422
    # El pago sigue al gasto: comercio nuevo.
    r = await api.client.patch(f"/api/v1/transactions/{e.tx}", json={"payee": "Coto"})
    assert r.status_code == 200
    assert (await api.fila("transactions", pid))["payee"] == "Coto"


async def test_quien_puso_no_recibe_ademas_gasto_nuevo(api) -> None:
    e = await _escena(api)
    await _pago(api, e)
    llegada = (
        await api.session.execute(
            text("SELECT created_at FROM transactions WHERE id = :i"), {"i": e.tx}
        )
    ).scalar_one()
    await aviso_grupos.avisar(api.session, llegada + timedelta(minutes=2))
    assert await _avisos(api, e.beto, "gasto_compartido") == []


async def _aviso_de_pago(api, beto: str):
    from app.models.user import Notification

    fila = (
        await api.session.execute(
            text("SELECT id FROM notifications WHERE user_id = :u AND type = 'pago_por_confirmar'"),
            {"u": beto},
        )
    ).scalar_one()
    return await api.session.get(Notification, fila)


async def test_el_boton_del_aviso_confirma_con_la_ultima_cuenta(api) -> None:
    from app.services import aviso_pagos

    e = await _escena(api)
    pid = await _pago(api, e)
    aviso = await _aviso_de_pago(api, e.beto)
    # Sin nada pagado antes no hay cuenta que proponer: sin boton.
    assert await aviso_pagos.acciones_de(api.session, aviso) == {}

    with como(e.beto):
        cta_beto = await _cuenta(api, "Billetera")
        cat = await _post(
            api, "categories", {"id": str(uuid.uuid4()), "name": "Varios", "kind": "expense"}
        )
        await _post(
            api,
            "transactions",
            {
                "id": str(uuid.uuid4()),
                "kind": "expense",
                "occurred_at": "2026-10-18T12:00:00-03:00",
                "amount": 100,
                "currency": "ARS",
                "account_id": cta_beto,
                "category_id": cat["id"],
            },
        )
    botones = await aviso_pagos.acciones_de(api.session, aviso)
    assert botones["acciones"] == [{"accion": "pagado", "titulo": "Pagada con Billetera"}]
    assert botones["accion_url"] == "/api/v1/payment-actions"

    r = await api.client.post(
        "/api/v1/payment-actions", json={"token": botones["token"], "accion": "pagado"}
    )
    assert r.status_code == 204, r.text
    pago = await api.fila("transactions", pid)
    assert (pago["status"], pago["account_id"]) == ("confirmed", cta_beto)
    assert (await api.fila("transaction_payers", pid))["status"] == "confirmed"
    # Un solo uso.
    r = await api.client.post(
        "/api/v1/payment-actions", json={"token": botones["token"], "accion": "pagado"}
    )
    assert r.status_code == 404


async def test_un_aviso_viejo_no_pisa_lo_respondido_en_la_app(api) -> None:
    from app.services import aviso_pagos

    e = await _escena(api)
    pid = await _pago(api, e)
    with como(e.beto):
        cta_beto = await _cuenta(api, "Billetera")
        cat = await _post(
            api, "categories", {"id": str(uuid.uuid4()), "name": "Varios", "kind": "expense"}
        )
        await _post(
            api,
            "transactions",
            {
                "id": str(uuid.uuid4()),
                "kind": "expense",
                "occurred_at": "2026-10-18T12:00:00-03:00",
                "amount": 100,
                "currency": "ARS",
                "account_id": cta_beto,
                "category_id": cat["id"],
            },
        )
    botones = await aviso_pagos.acciones_de(api.session, await _aviso_de_pago(api, e.beto))
    with como(e.beto):
        await api.client.patch(f"/api/v1/transactions/{pid}", json={"status": "rejected"})
    r = await api.client.post(
        "/api/v1/payment-actions", json={"token": botones["token"], "accion": "pagado"}
    )
    assert r.status_code == 204
    assert (await api.fila("transactions", pid))["status"] == "rejected"


async def test_un_pago_confirmado_no_vuelve_a_pendiente(api) -> None:
    # Solo se deshace un "no la pague": desde confirmado, le sacaria el debito a
    # su cuenta y el balance lo seguiria contando.
    e = await _escena(api)
    pid = await _pago(api, e)
    with como(e.beto):
        cta_beto = await _cuenta(api, "De Beto")
        await api.client.patch(
            f"/api/v1/transactions/{pid}", json={"status": "confirmed", "account_id": cta_beto}
        )
        r = await api.client.patch(f"/api/v1/transactions/{pid}", json={"status": "pending"})
        assert r.status_code == 422
    assert (await api.fila("transactions", pid))["status"] == "confirmed"


async def test_si_cambia_la_moneda_del_gasto_se_vuelve_a_confirmar(api) -> None:
    e = await _escena(api)
    pid = await _pago(api, e)
    with como(e.beto):
        cta_beto = await _cuenta(api, "De Beto")
        await api.client.patch(
            f"/api/v1/transactions/{pid}", json={"status": "confirmed", "account_id": cta_beto}
        )
    # El gasto pasa a dolares (con una cuenta en dolares de quien lo cargo).
    usd = await _cuenta(api, "Dolares", currency="USD")
    r = await api.client.patch(
        f"/api/v1/transactions/{e.tx}", json={"currency": "USD", "account_id": usd}
    )
    assert r.status_code == 200, r.text
    pago = await api.fila("transactions", pid)
    assert (pago["currency"], pago["status"], pago["amount_account"]) == ("USD", "pending", None)
    assert (await api.fila("transaction_payers", pid))["status"] == "pending"
    assert len(await _avisos(api, e.beto, "pago_cambiado")) == 1
