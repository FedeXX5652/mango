"""Calendario de pagos (1.5.0, ver 0030): recordatorios y ciclos."""

import uuid
from datetime import date
from types import SimpleNamespace

import pytest
from sqlalchemy import text

from app.services.repeticion import id_ciclo

# --- Ayudas ----------------------------------------------------------------------


def _recordatorio(**over) -> dict:
    base = {
        "id": str(uuid.uuid4()),
        "title": "Alquiler",
        "freq": "monthly",
        "month_mode": "day",
        "month_day": 10,
        "start_date": "2026-10-10",
        "weekend_shift": "next",
        "track_from": "2026-10-04",
    }
    base.update(over)
    return base


async def _crear(api: SimpleNamespace, **over) -> dict:
    r = await api.client.post("/api/v1/reminders", json=_recordatorio(**over))
    assert r.status_code == 201, r.text
    return r.json()


def _ciclo(reminder_id: str, nominal: str = "2026-10-10", **over) -> dict:
    base = {
        "id": str(id_ciclo(reminder_id, date.fromisoformat(nominal))),
        "reminder_id": reminder_id,
        "nominal_date": nominal,
        "status": "paid",
    }
    base.update(over)
    return base


async def _otro_usuario(api: SimpleNamespace) -> uuid.UUID:
    uid = uuid.uuid4()
    await api.session.execute(
        text(
            "INSERT INTO users (id, username, email, password_hash, display_name) "
            "VALUES (:id, :u, :e, '!', 'Otro')"
        ),
        {"id": str(uid), "u": f"otro-{uid.hex[:6]}", "e": f"{uid}@test.local"},
    )
    await api.session.flush()
    return uid


async def _de_otro(api: SimpleNamespace) -> str:
    """Un recordatorio de otra persona, cargado directo en la base."""
    otro = await _otro_usuario(api)
    rid = str(uuid.uuid4())
    await api.session.execute(
        text(
            "INSERT INTO reminders (id, owner_id, title, freq, start_date, weekend_shift, "
            "track_from) VALUES (:id, :u, 'Ajeno', 'once', '2026-10-10', 'none', '2026-10-04')"
        ),
        {"id": rid, "u": str(otro)},
    )
    await api.session.flush()
    return rid


async def _movimiento(api: SimpleNamespace) -> str:
    cuenta = await api.client.post(
        "/api/v1/accounts",
        json={"id": str(uuid.uuid4()), "name": "Cuenta", "type": "cash", "currency": "ARS"},
    )
    categoria = await api.client.post(
        "/api/v1/categories", json={"id": str(uuid.uuid4()), "name": "Casa", "kind": "expense"}
    )
    r = await api.client.post(
        "/api/v1/transactions",
        json={
            "id": str(uuid.uuid4()),
            "kind": "expense",
            "occurred_at": "2026-10-10T12:00:00Z",
            "amount": 50000000,
            "currency": "ARS",
            "account_id": cuenta.json()["id"],
            "category_id": categoria.json()["id"],
        },
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


# --- Recordatorios -----------------------------------------------------------------


async def test_crear_con_los_avisos_por_defecto(api: SimpleNamespace) -> None:
    creado = await _crear(api, title="  Alquiler  ")
    assert creado["title"] == "Alquiler"
    # Por defecto: el mismo dia a las 9, y se sigue avisando 3 dias (R3, R4).
    assert creado["alerts"] == [{"days_before": 0, "time": "09:00"}]
    assert creado["followup_days"] == 3
    fila = await api.fila("reminders", creado["id"])
    assert fila["owner_id"] == str(api.owner_id)
    assert fila["weekend_shift"] == "next"


async def test_los_avisos_llegan_como_el_json_del_telefono(api: SimpleNamespace) -> None:
    # En SQLite `alerts` es texto: la sync lo sube como el JSON de la lista.
    creado = await _crear(
        api,
        alerts='[{"days_before": 3, "time": "09:00"}, {"days_before": 0, "time": "18:30"}]',
        followup_days=None,
    )
    assert creado["alerts"][1] == {"days_before": 0, "time": "18:30"}
    # NULL = seguir avisando hasta que se responda.
    assert creado["followup_days"] is None


@pytest.mark.parametrize(
    ("over", "motivo"),
    [
        ({"freq": "weekly", "month_mode": None, "month_day": None}, "día de la semana"),
        ({"month_mode": None, "month_day": None}, "cómo se repite"),
        ({"month_mode": "weekday", "month_day": None, "month_week": 2}, "qué semana"),
        ({"freq": "daily"}, "cada mes"),
        ({"count": 3, "until_date": "2027-01-01"}, "un solo fin"),
        ({"until_date": "2026-01-01"}, "anterior"),
    ],
)
async def test_una_regla_incoherente_se_rechaza(
    api: SimpleNamespace, over: dict, motivo: str
) -> None:
    r = await api.client.post("/api/v1/reminders", json=_recordatorio(**over))
    assert r.status_code == 422, r.text
    assert motivo in r.json()["detail"]


@pytest.mark.parametrize(
    "over",
    [
        {"alerts": [{"days_before": 0, "time": "24:00"}]},
        {"alerts": [{"days_before": 0, "time": "9:00"}]},
        {"alerts": [{"days_before": 0, "time": "12:60"}]},
        {"weekend_shift": "despues"},
        {"weekend_shift": None},  # se elige al crear, no hay valor por defecto
        {"interval_count": 0},
        {"weekdays": 128},
        {"title": "   "},
    ],
)
async def test_valores_fuera_de_rango(api: SimpleNamespace, over: dict) -> None:
    r = await api.client.post("/api/v1/reminders", json=_recordatorio(**over))
    assert r.status_code == 422, r.text


async def test_semanal_y_por_dia_de_la_semana(api: SimpleNamespace) -> None:
    sem = await _crear(api, freq="weekly", weekdays=9, month_mode=None, month_day=None)
    assert sem["weekdays"] == 9
    ultimo_viernes = await _crear(
        api, month_mode="weekday", month_day=None, month_week=-1, month_weekday=4
    )
    assert (ultimo_viernes["month_week"], ultimo_viernes["month_weekday"]) == (-1, 4)


async def test_una_plantilla_ajena_o_borrada_no_se_vincula(api: SimpleNamespace) -> None:
    viva = await api.client.post(
        "/api/v1/templates", json={"id": str(uuid.uuid4()), "name": "Alq", "kind": "expense"}
    )
    con = await _crear(api, template_id=viva.json()["id"])
    assert con["template_id"] == viva.json()["id"]
    # Una que no es mia (o no existe) queda como "sin plantilla", sin rechazar.
    sin = await _crear(api, template_id=str(uuid.uuid4()))
    assert sin["template_id"] is None


async def test_borrar_la_plantilla_desvincula_el_recordatorio(api: SimpleNamespace) -> None:
    plantilla = await api.client.post(
        "/api/v1/templates", json={"id": str(uuid.uuid4()), "name": "Alq", "kind": "expense"}
    )
    tid = plantilla.json()["id"]
    creado = await _crear(api, template_id=tid)
    r = await api.client.delete(f"/api/v1/templates/{tid}")
    assert r.status_code == 204
    fila = await api.fila("reminders", creado["id"])
    assert fila["template_id"] is None
    assert fila["deleted_at"] is None  # el recordatorio queda


async def test_modificar_valida_la_regla_completa(api: SimpleNamespace) -> None:
    creado = await _crear(api)
    url = f"/api/v1/reminders/{creado['id']}"
    r = await api.client.patch(url, json={"title": "Alquiler depto"})
    assert r.status_code == 200 and r.json()["title"] == "Alquiler depto"
    # Pasar a semanal sin sacar el dia del mes ni poner dias: la regla no cierra.
    r = await api.client.patch(url, json={"freq": "weekly"})
    assert r.status_code == 422
    r = await api.client.patch(
        url,
        json={
            "freq": "weekly",
            "weekdays": 1,
            "month_mode": None,
            "month_day": None,
            "track_from": "2026-10-20",
        },
    )
    assert r.status_code == 200, r.text
    assert r.json()["track_from"] == "2026-10-20"


async def test_el_de_otro_no_se_toca(api: SimpleNamespace) -> None:
    ajeno = await _de_otro(api)
    r = await api.client.patch(f"/api/v1/reminders/{ajeno}", json={"title": "Mio"})
    assert r.status_code == 404
    r = await api.client.delete(f"/api/v1/reminders/{ajeno}")
    assert r.status_code == 404


async def test_borrar_es_logico(api: SimpleNamespace) -> None:
    creado = await _crear(api)
    r = await api.client.delete(f"/api/v1/reminders/{creado['id']}")
    assert r.status_code == 204
    assert (await api.fila("reminders", creado["id"]))["deleted_at"] is not None


# --- Ciclos ------------------------------------------------------------------------


async def test_marcar_pagado(api: SimpleNamespace) -> None:
    rec = await _crear(api)
    r = await api.client.post("/api/v1/reminder-cycles", json=_ciclo(rec["id"]))
    assert r.status_code == 201, r.text
    ciclo = r.json()
    assert ciclo["status"] == "paid"
    assert ciclo["answered_at"] is not None
    assert ciclo["answered_by"] == str(api.owner_id)
    fila = await api.fila("reminder_cycles", ciclo["id"])
    assert fila["owner_id"] == str(api.owner_id)


async def test_el_id_tiene_que_ser_el_determinista(api: SimpleNamespace) -> None:
    rec = await _crear(api)
    r = await api.client.post(
        "/api/v1/reminder-cycles", json=_ciclo(rec["id"], id=str(uuid.uuid4()))
    )
    assert r.status_code == 422


async def test_dos_dispositivos_marcan_el_mismo_ciclo(api: SimpleNamespace) -> None:
    # El segundo no choca (un 409 se perderia): actualiza la misma fila.
    rec = await _crear(api)
    primero = (await api.client.post("/api/v1/reminder-cycles", json=_ciclo(rec["id"]))).json()
    r = await api.client.post("/api/v1/reminder-cycles", json=_ciclo(rec["id"], status="skipped"))
    assert r.status_code == 201, r.text
    assert r.json()["id"] == primero["id"] and r.json()["status"] == "skipped"
    n = (
        await api.session.execute(
            text("SELECT count(*) FROM reminder_cycles WHERE reminder_id = :r"), {"r": rec["id"]}
        )
    ).scalar_one()
    assert n == 1


async def test_repetir_el_mismo_estado_conserva_quien_y_cuando(api: SimpleNamespace) -> None:
    rec = await _crear(api)
    primero = (await api.client.post("/api/v1/reminder-cycles", json=_ciclo(rec["id"]))).json()
    segundo = (await api.client.post("/api/v1/reminder-cycles", json=_ciclo(rec["id"]))).json()
    assert segundo["answered_at"] == primero["answered_at"]


async def test_pagar_con_el_movimiento_y_deshacer(api: SimpleNamespace) -> None:
    rec = await _crear(api)
    tx = await _movimiento(api)
    ciclo = (
        await api.client.post("/api/v1/reminder-cycles", json=_ciclo(rec["id"], transaction_id=tx))
    ).json()
    assert ciclo["transaction_id"] == tx
    # "Ya lo pague" desde otro dispositivo, sin movimiento: no borra el pago.
    otra = (await api.client.post("/api/v1/reminder-cycles", json=_ciclo(rec["id"]))).json()
    assert otra["transaction_id"] == tx
    # Deshacer: vuelve a pendiente y suelta el pago (el movimiento queda).
    r = await api.client.patch(f"/api/v1/reminder-cycles/{ciclo['id']}", json={"status": "pending"})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "pending"
    assert r.json()["answered_at"] is None and r.json()["transaction_id"] is None
    assert (await api.fila("transactions", tx))["deleted_at"] is None


async def test_un_movimiento_ajeno_no_sirve_de_pago(api: SimpleNamespace) -> None:
    rec = await _crear(api)
    r = await api.client.post(
        "/api/v1/reminder-cycles", json=_ciclo(rec["id"], transaction_id=str(uuid.uuid4()))
    )
    assert r.status_code == 422


async def test_ciclo_de_un_recordatorio_ajeno_es_404(api: SimpleNamespace) -> None:
    ajeno = await _de_otro(api)
    r = await api.client.post("/api/v1/reminder-cycles", json=_ciclo(ajeno))
    assert r.status_code == 404


async def test_ciclo_de_un_recordatorio_borrado_queda_en_la_historia(
    api: SimpleNamespace,
) -> None:
    # Marcado sin conexion en un telefono mientras en otro se borraba.
    rec = await _crear(api)
    await api.client.delete(f"/api/v1/reminders/{rec['id']}")
    r = await api.client.post("/api/v1/reminder-cycles", json=_ciclo(rec["id"]))
    assert r.status_code == 201, r.text


async def test_modificar_un_ciclo_ajeno_es_404(api: SimpleNamespace) -> None:
    r = await api.client.patch(f"/api/v1/reminder-cycles/{uuid.uuid4()}", json={"status": "paid"})
    assert r.status_code == 404


async def test_borrar_dos_veces_no_es_un_error(api: SimpleNamespace) -> None:
    # Dos dispositivos sin conexion, o un reintento de la sync: el segundo DELETE
    # no tiene que terminar en "Rechazados".
    creado = await _crear(api)
    assert (await api.client.delete(f"/api/v1/reminders/{creado['id']}")).status_code == 204
    assert (await api.client.delete(f"/api/v1/reminders/{creado['id']}")).status_code == 204
    # El de otra persona sigue siendo 404, este borrado o no.
    ajeno = await _de_otro(api)
    assert (await api.client.delete(f"/api/v1/reminders/{ajeno}")).status_code == 404


async def test_avisos_a_cualquier_hora(api: SimpleNamespace) -> None:
    # Sin franja horaria (2026-10-08): de noche o de madrugada, vale.
    creado = await _crear(
        api,
        alerts=[{"days_before": 0, "time": "23:30"}, {"days_before": 1, "time": "00:15"}],
    )
    assert [a["time"] for a in creado["alerts"]] == ["23:30", "00:15"]
