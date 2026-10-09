"""Recordatorios que siguen a una tarjeta o a una deuda ("Avisarme", 1.6.0, ver
0030). El servidor los mantiene al dia cuando cambia la tarjeta o la deuda."""

import uuid
from datetime import date, datetime
from types import SimpleNamespace
from zoneinfo import ZoneInfo

from sqlalchemy import select, text

from app.core.config import settings
from app.models.user import Notification
from app.services import aviso_recordatorios as servicio
from app.services.repeticion import id_ciclo

TZ = ZoneInfo(settings.tz)


def _hoy() -> str:
    return datetime.now(TZ).date().isoformat()


async def _tarjeta(api: SimpleNamespace, **over) -> str:
    datos = {"id": str(uuid.uuid4()), "name": "Visa", "kind": "credit_card", "due_day": 5}
    datos.update(over)
    r = await api.client.post("/api/v1/payment-methods", json=datos)
    assert r.status_code == 201, r.text
    return datos["id"]


async def _deuda(api: SimpleNamespace, **over) -> str:
    datos = {
        "id": str(uuid.uuid4()),
        "direction": "payable",
        "counterparty": "Beto",
        "amount": 50000,
        "currency": "ARS",
        "due_date": "2026-11-20",
    }
    datos.update(over)
    r = await api.client.post("/api/v1/debts", json=datos)
    assert r.status_code == 201, r.text
    return datos["id"]


async def _de_tarjeta(api: SimpleNamespace, pm: str, **over) -> dict:
    datos = {
        "id": str(uuid.uuid4()),
        "title": "Visa",
        "freq": "monthly",
        "month_mode": "day",
        "month_day": 5,
        "start_date": "2026-11-05",
        "weekend_shift": "next",
        "track_from": "2026-10-09",
        "payment_method_id": pm,
    }
    datos.update(over)
    r = await api.client.post("/api/v1/reminders", json=datos)
    assert r.status_code == 201, r.text
    return r.json()


async def _de_deuda(api: SimpleNamespace, debt: str, **over) -> dict:
    datos = {
        "id": str(uuid.uuid4()),
        "title": "Pagarle a Beto",
        "freq": "once",
        "start_date": "2026-11-20",
        "weekend_shift": "none",
        "track_from": "2026-10-09",
        "debt_id": debt,
    }
    datos.update(over)
    r = await api.client.post("/api/v1/reminders", json=datos)
    assert r.status_code == 201, r.text
    return r.json()


# --- El vinculo ------------------------------------------------------------------


async def test_se_vincula_a_una_tarjeta_o_a_una_deuda(api: SimpleNamespace) -> None:
    pm = await _tarjeta(api)
    debt = await _deuda(api)
    assert (await _de_tarjeta(api, pm))["payment_method_id"] == pm
    creado = await _de_deuda(api, debt)
    assert creado["debt_id"] == debt
    assert (await api.fila("reminders", creado["id"]))["debt_id"] == debt


async def test_no_a_las_dos(api: SimpleNamespace) -> None:
    pm = await _tarjeta(api)
    debt = await _deuda(api)
    r = await api.client.post(
        "/api/v1/reminders",
        json={
            "id": str(uuid.uuid4()),
            "title": "Las dos",
            "freq": "once",
            "start_date": "2026-11-20",
            "weekend_shift": "none",
            "track_from": "2026-10-09",
            "payment_method_id": pm,
            "debt_id": debt,
        },
    )
    assert r.status_code == 422


async def test_un_vinculo_que_no_sirve_queda_en_nada(api: SimpleNamespace) -> None:
    """Como la plantilla: la tarjeta o la deuda se pudo borrar en otro
    dispositivo. El recordatorio se guarda igual, sin vinculo."""
    debito = await _tarjeta(api, kind="debit_card", due_day=None)
    archivada = await _tarjeta(api)
    await api.client.patch(f"/api/v1/payment-methods/{archivada}", json={"archived": True})
    borrada = await _deuda(api)
    await api.client.delete(f"/api/v1/debts/{borrada}")
    assert (await _de_tarjeta(api, debito))["payment_method_id"] is None
    assert (await _de_tarjeta(api, archivada))["payment_method_id"] is None
    assert (await _de_tarjeta(api, str(uuid.uuid4())))["payment_method_id"] is None
    assert (await _de_deuda(api, borrada))["debt_id"] is None


async def test_la_tarjeta_o_la_deuda_de_otro_no_se_vincula(api: SimpleNamespace) -> None:
    otro = uuid.uuid4()
    await api.session.execute(
        text(
            "INSERT INTO users (id, username, email, password_hash, display_name) "
            "VALUES (:id, :u, :e, '!', 'Otro')"
        ),
        {"id": str(otro), "u": f"otro-{otro.hex[:6]}", "e": f"{otro}@test.local"},
    )
    pm, debt = uuid.uuid4(), uuid.uuid4()
    await api.session.execute(
        text(
            "INSERT INTO payment_methods (id, owner_id, name, kind, due_day) "
            "VALUES (:id, :u, 'Ajena', 'credit_card', 5)"
        ),
        {"id": str(pm), "u": str(otro)},
    )
    await api.session.execute(
        text(
            "INSERT INTO debts (id, owner_id, direction, counterparty, amount, currency) "
            "VALUES (:id, :u, 'payable', 'X', 100, 'ARS')"
        ),
        {"id": str(debt), "u": str(otro)},
    )
    await api.session.flush()
    assert (await _de_tarjeta(api, str(pm)))["payment_method_id"] is None
    assert (await _de_deuda(api, str(debt)))["debt_id"] is None


# --- La tarjeta ------------------------------------------------------------------


async def test_cambiar_el_dia_de_vencimiento_corre_el_recordatorio(api: SimpleNamespace) -> None:
    pm = await _tarjeta(api)
    r = await _de_tarjeta(api, pm)
    resp = await api.client.patch(f"/api/v1/payment-methods/{pm}", json={"due_day": 12})
    assert resp.status_code == 200, resp.text
    fila = await api.fila("reminders", r["id"])
    assert fila["month_day"] == 12
    # Cambio la regla: lo vencido cuenta desde hoy, como en el formulario.
    assert fila["track_from"] == _hoy()


async def test_una_regla_que_cambio_la_persona_no_se_corre(api: SimpleNamespace) -> None:
    pm = await _tarjeta(api)
    r = await _de_tarjeta(
        api, pm, freq="weekly", month_mode=None, month_day=None, weekdays=1, start_date="2026-11-02"
    )
    await api.client.patch(f"/api/v1/payment-methods/{pm}", json={"due_day": 12})
    fila = await api.fila("reminders", r["id"])
    assert fila["freq"] == "weekly" and fila["month_day"] is None


async def test_archivar_o_borrar_la_tarjeta_borra_el_recordatorio(api: SimpleNamespace) -> None:
    pm1, pm2 = await _tarjeta(api), await _tarjeta(api)
    r1, r2 = await _de_tarjeta(api, pm1), await _de_tarjeta(api, pm2)
    await api.client.patch(f"/api/v1/payment-methods/{pm1}", json={"archived": True})
    assert (await api.client.delete(f"/api/v1/payment-methods/{pm2}")).status_code == 204
    assert (await api.fila("reminders", r1["id"]))["deleted_at"] is not None
    assert (await api.fila("reminders", r2["id"]))["deleted_at"] is not None


async def test_otros_cambios_de_la_tarjeta_no_lo_tocan(api: SimpleNamespace) -> None:
    pm = await _tarjeta(api)
    r = await _de_tarjeta(api, pm)
    await api.client.patch(f"/api/v1/payment-methods/{pm}", json={"name": "Visa Galicia"})
    fila = await api.fila("reminders", r["id"])
    assert fila["month_day"] == 5 and fila["track_from"] == "2026-10-09"
    assert fila["deleted_at"] is None


# --- La deuda --------------------------------------------------------------------


async def test_cambiar_la_fecha_de_la_deuda_mueve_el_recordatorio(api: SimpleNamespace) -> None:
    debt = await _deuda(api)
    r = await _de_deuda(api, debt)
    await api.client.patch(f"/api/v1/debts/{debt}", json={"due_date": "2026-12-15"})
    fila = await api.fila("reminders", r["id"])
    assert fila["start_date"] == "2026-12-15"
    assert fila["track_from"] == min("2026-12-15", _hoy())
    # Una fecha pasada cuenta desde ahi: la deuda ya vencio.
    await api.client.patch(f"/api/v1/debts/{debt}", json={"due_date": "2026-01-15"})
    fila = await api.fila("reminders", r["id"])
    assert fila["start_date"] == "2026-01-15" and fila["track_from"] == "2026-01-15"


async def test_sacarle_la_fecha_a_la_deuda_borra_el_recordatorio(api: SimpleNamespace) -> None:
    debt = await _deuda(api)
    r = await _de_deuda(api, debt)
    await api.client.patch(f"/api/v1/debts/{debt}", json={"due_date": None})
    assert (await api.fila("reminders", r["id"]))["deleted_at"] is not None


async def test_saldar_la_deuda_marca_el_vencimiento_pagado(api: SimpleNamespace) -> None:
    debt = await _deuda(api, amount=50000)
    r = await _de_deuda(api, debt)
    cid = id_ciclo(uuid.UUID(r["id"]), date(2026, 11, 20))
    # Una parte: todavia debe, el vencimiento sigue pendiente.
    await api.client.patch(f"/api/v1/debts/{debt}", json={"amount_settled": 20000})
    assert await api.fila("reminder_cycles", cid) is None
    await api.client.patch(f"/api/v1/debts/{debt}", json={"amount_settled": 50000})
    ciclo = await api.fila("reminder_cycles", cid)
    assert ciclo["status"] == "paid"
    assert ciclo["answered_by"] == str(api.owner_id)
    assert ciclo["owner_id"] == str(api.owner_id)


async def test_borrar_la_deuda_borra_el_recordatorio(api: SimpleNamespace) -> None:
    debt = await _deuda(api)
    r = await _de_deuda(api, debt)
    assert (await api.client.delete(f"/api/v1/debts/{debt}")).status_code == 204
    assert (await api.fila("reminders", r["id"]))["deleted_at"] is not None


# --- El aviso de una deuda -------------------------------------------------------


async def test_el_aviso_de_una_deuda_no_trae_ya_lo_pague(api: SimpleNamespace) -> None:
    """Una deuda se salda en la app (cuanto se pago): solo "Más tarde"."""
    debt = await _deuda(api, due_date="2026-10-12")
    r = await _de_deuda(api, debt, start_date="2026-10-12")
    await servicio.avisar(api.session, datetime(2026, 10, 12, 9, 0, tzinfo=TZ))
    aviso = (
        await api.session.execute(
            select(Notification).where(Notification.meta["reminder_id"].astext == r["id"])
        )
    ).scalar_one()
    extra = await servicio.acciones_de(api.session, aviso)
    assert [a["accion"] for a in extra["acciones"]] == ["mas-tarde"]


async def test_un_permiso_viejo_no_marca_pagada_una_deuda(api: SimpleNamespace) -> None:
    """El permiso salio cuando el recordatorio no seguia a la deuda: el boton
    "Ya lo pagué" no la marca. El service worker abre la app."""
    debt = await _deuda(api, due_date="2026-10-12")
    rid = str(uuid.uuid4())
    await api.client.post(
        "/api/v1/reminders",
        json={
            "id": rid,
            "title": "Beto",
            "freq": "once",
            "start_date": "2026-10-12",
            "weekend_shift": "none",
            "track_from": "2026-10-09",
        },
    )
    await servicio.avisar(api.session, datetime(2026, 10, 12, 9, 0, tzinfo=TZ))
    aviso = (
        await api.session.execute(
            select(Notification).where(Notification.meta["reminder_id"].astext == rid)
        )
    ).scalar_one()
    token = (await servicio.acciones_de(api.session, aviso))["token"]
    await api.session.execute(
        text("UPDATE reminders SET debt_id = :d WHERE id = :r"), {"d": debt, "r": rid}
    )
    await api.session.flush()
    r = await api.client.post("/api/v1/reminder-actions", json={"token": token, "accion": "pagado"})
    assert r.status_code == 404
    ciclo = await api.fila("reminder_cycles", id_ciclo(uuid.UUID(rid), date(2026, 10, 12)))
    assert ciclo is None or ciclo["status"] == "pending"
