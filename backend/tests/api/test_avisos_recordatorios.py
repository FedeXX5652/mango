"""Avisos del calendario de pagos (0030, etapa 2): la tarea del planificador, los
botones del push (con su permiso de un solo uso) y "Mas tarde"."""

import json
import uuid
from datetime import UTC, date, datetime, timedelta
from types import SimpleNamespace
from zoneinfo import ZoneInfo

import pytest
from sqlalchemy import select, text

from app.core.config import settings
from app.models.user import Notification
from app.services import aviso_recordatorios as servicio
from app.services import planificador
from app.services import push as servicio_push
from app.services.repeticion import id_ciclo

TZ = ZoneInfo(settings.tz)
OCT = date(2026, 10, 10)  # sabado: vence el lunes 12


def _local(dia: int, hora: int, minuto: int = 0) -> datetime:
    return datetime(2026, 10, dia, hora, minuto, tzinfo=TZ)


async def _recordatorio(api: SimpleNamespace, **over) -> str:
    base = {
        "id": str(uuid.uuid4()),
        "title": "Alquiler",
        "freq": "monthly",
        "month_mode": "day",
        "month_day": 10,
        "start_date": "2026-01-10",
        "weekend_shift": "next",
        "track_from": "2026-10-01",
    }
    base.update(over)
    r = await api.client.post("/api/v1/reminders", json=base)
    assert r.status_code == 201, r.text
    return base["id"]


async def _avisos(api: SimpleNamespace, rid: str) -> list[dict]:
    filas = await api.session.execute(
        text(
            "SELECT title, body, link, meta FROM notifications "
            "WHERE meta->>'reminder_id' = :r ORDER BY created_at"
        ),
        {"r": rid},
    )
    return [dict(f._mapping) for f in filas]


async def _ciclo(api: SimpleNamespace, rid: str, nominal: date = OCT) -> dict | None:
    return await api.fila("reminder_cycles", id_ciclo(rid, nominal))


# --- La tarea ------------------------------------------------------------------


async def test_avisa_a_su_hora_y_no_repite(api: SimpleNamespace) -> None:
    rid = await _recordatorio(api)
    await servicio.avisar(api.session, _local(12, 8, 59))
    assert await _avisos(api, rid) == []
    await servicio.avisar(api.session, _local(12, 9, 5))
    avisos = await _avisos(api, rid)
    assert [(a["title"], a["body"]) for a in avisos] == [("Alquiler", "Vence hoy")]
    assert avisos[0]["link"] == f"/calendario?r={rid}&n=2026-10-10"
    assert avisos[0]["meta"] == {"reminder_id": rid, "nominal": "2026-10-10"}
    ciclo = await _ciclo(api, rid)
    assert ciclo["status"] == "pending" and ciclo["alerts_sent"] == ["0@09:00"]
    # La vuelta siguiente no lo repite.
    await servicio.avisar(api.session, _local(12, 9, 6))
    assert len(await _avisos(api, rid)) == 1


async def test_el_monto_sale_de_la_plantilla(api: SimpleNamespace) -> None:
    plantilla = await api.client.post(
        "/api/v1/templates",
        json={
            "id": str(uuid.uuid4()),
            "name": "Alq",
            "kind": "expense",
            "amount": 50000000,
            "currency": "ARS",
        },
    )
    rid = await _recordatorio(api, template_id=plantilla.json()["id"])
    await servicio.avisar(api.session, _local(12, 9))
    assert (await _avisos(api, rid))[0]["body"] == "Vence hoy · $500.000,00"


async def test_seguimiento_si_no_se_responde(api: SimpleNamespace) -> None:
    rid = await _recordatorio(api)
    await servicio.avisar(api.session, _local(13, 9, 30))
    assert [a["body"] for a in await _avisos(api, rid)] == [
        "Venció el lunes 12/10. ¿Ya lo pagaste?"
    ]
    assert (await _ciclo(api, rid))["followup_sent_on"] == "2026-10-13"


async def test_nada_entre_las_22_y_las_8(api: SimpleNamespace) -> None:
    rid = await _recordatorio(api)
    await servicio.avisar(api.session, _local(12, 23))
    await servicio.avisar(api.session, _local(13, 7, 30))
    assert await _avisos(api, rid) == []


async def test_lo_respondido_no_avisa(api: SimpleNamespace) -> None:
    rid = await _recordatorio(api)
    cid = str(id_ciclo(rid, OCT))
    r = await api.client.post(
        "/api/v1/reminder-cycles",
        json={"id": cid, "reminder_id": rid, "nominal_date": "2026-10-10", "status": "paid"},
    )
    assert r.status_code == 201, r.text
    await servicio.avisar(api.session, _local(12, 9))
    await servicio.avisar(api.session, _local(13, 9))
    assert await _avisos(api, rid) == []


async def test_pospuesto_calla_y_avisa_una_vez(api: SimpleNamespace) -> None:
    rid = await _recordatorio(api)
    cid = str(id_ciclo(rid, OCT))
    hasta = _local(12, 15).astimezone(UTC).isoformat()
    r = await api.client.post(
        "/api/v1/reminder-cycles",
        json={
            "id": cid,
            "reminder_id": rid,
            "nominal_date": "2026-10-10",
            "status": "pending",
            "snoozed_until": hasta,
        },
    )
    assert r.status_code == 201, r.text
    await servicio.avisar(api.session, _local(12, 14))
    assert await _avisos(api, rid) == []
    await servicio.avisar(api.session, _local(12, 15, 1))
    assert [a["body"] for a in await _avisos(api, rid)] == ["Te lo recuerdo: vence hoy"]
    assert (await _ciclo(api, rid))["snoozed_until"] is None


# --- "Mas tarde" desde la app -----------------------------------------------------


async def test_mas_tarde_nunca_cae_de_madrugada(api: SimpleNamespace) -> None:
    rid = await _recordatorio(api)
    cid = str(id_ciclo(rid, OCT))
    # Pedido para las 23:30 (hora local): queda a las 8 del dia siguiente.
    noche = (datetime.now(TZ) + timedelta(days=1)).replace(hour=23, minute=30)
    r = await api.client.post(
        "/api/v1/reminder-cycles",
        json={
            "id": cid,
            "reminder_id": rid,
            "nominal_date": "2026-10-10",
            "status": "pending",
            "snoozed_until": noche.isoformat(),
        },
    )
    assert r.status_code == 201, r.text
    quedo = datetime.fromisoformat(r.json()["snoozed_until"]).astimezone(TZ)
    assert (quedo.date(), quedo.hour, quedo.minute) == (noche.date() + timedelta(days=1), 8, 0)
    # Responder lo deja sin efecto.
    r = await api.client.patch(f"/api/v1/reminder-cycles/{cid}", json={"status": "paid"})
    assert r.json()["snoozed_until"] is None


async def test_mas_tarde_hasta_dos_meses(api: SimpleNamespace) -> None:
    rid = await _recordatorio(api)
    r = await api.client.post(
        "/api/v1/reminder-cycles",
        json={
            "id": str(id_ciclo(rid, OCT)),
            "reminder_id": rid,
            "nominal_date": "2026-10-10",
            "status": "pending",
            "snoozed_until": (datetime.now(UTC) + timedelta(days=90)).isoformat(),
        },
    )
    assert r.status_code == 422


async def test_preferencia_del_boton_mas_tarde(api: SimpleNamespace) -> None:
    r = await api.client.patch(f"/api/v1/users/{api.owner_id}", json={"snooze_default": "manana"})
    assert r.status_code == 200, r.text
    assert (await api.fila("users", api.owner_id))["snooze_default"] == "manana"
    r = await api.client.patch(f"/api/v1/users/{api.owner_id}", json={"snooze_default": "nunca"})
    assert r.status_code == 422


# --- Los botones del push ---------------------------------------------------------


async def _aviso_y_permiso(api: SimpleNamespace) -> tuple[str, str]:
    rid = await _recordatorio(api)
    await servicio.avisar(api.session, _local(12, 9))
    aviso = (
        await api.session.execute(
            select(Notification).where(Notification.meta["reminder_id"].astext == rid)
        )
    ).scalar_one()
    extra = await servicio.acciones_de(api.session, aviso)
    await api.session.flush()
    assert [a["accion"] for a in extra["acciones"]] == ["pagado", "mas-tarde"]
    return rid, extra["token"]


async def test_el_push_de_un_vencimiento_lleva_los_botones(
    api: SimpleNamespace, monkeypatch
) -> None:
    monkeypatch.setattr(settings, "vapid_public_key", "publica")
    monkeypatch.setattr(settings, "vapid_private_key", "privada")
    monkeypatch.setattr(settings, "vapid_subject", "https://mango.test")
    enviados: list[str] = []

    async def falso(info: dict, data: str) -> int:
        enviados.append(data)
        return 201

    monkeypatch.setattr(servicio_push, "enviar_mensaje", falso)
    await api.client.post(
        "/api/v1/push/subscriptions",
        json={
            "id": str(uuid.uuid4()),
            "endpoint": f"https://push.example/{uuid.uuid4()}",
            "keys": {"p256dh": "BOx", "auth": "aut"},
        },
    )
    rid = await _recordatorio(api)
    await servicio.avisar(api.session, _local(12, 9))
    await planificador.despachar_avisos(api.session)
    mios = [json.loads(d) for d in enviados if rid in d]
    assert len(mios) == 1
    assert [a["titulo"] for a in mios[0]["acciones"]] == ["Ya lo pagué", "Más tarde"]
    # Se guarda el hash del permiso, nunca el permiso.
    guardado = (
        await api.session.execute(
            text("SELECT token_hash FROM reminder_action_tokens WHERE reminder_id = :r"),
            {"r": rid},
        )
    ).scalar_one()
    assert guardado != mios[0]["token"] and len(guardado) == 64


async def test_boton_ya_lo_pague(api: SimpleNamespace) -> None:
    rid, token = await _aviso_y_permiso(api)
    r = await api.client.post("/api/v1/reminder-actions", json={"token": token, "accion": "pagado"})
    assert r.status_code == 204, r.text
    ciclo = await _ciclo(api, rid)
    assert ciclo["status"] == "paid" and ciclo["answered_by"] == str(api.owner_id)
    # De un solo uso.
    r = await api.client.post("/api/v1/reminder-actions", json={"token": token, "accion": "pagado"})
    assert r.status_code == 404


async def test_boton_mas_tarde(api: SimpleNamespace) -> None:
    rid, token = await _aviso_y_permiso(api)
    antes = datetime.now(UTC)
    r = await api.client.post(
        "/api/v1/reminder-actions", json={"token": token, "accion": "mas-tarde"}
    )
    assert r.status_code == 204, r.text
    ciclo = await _ciclo(api, rid)
    assert ciclo["status"] == "pending"
    assert datetime.fromisoformat(ciclo["snoozed_until"]) > antes


async def test_un_aviso_viejo_no_deshace_lo_respondido(api: SimpleNamespace) -> None:
    rid, token = await _aviso_y_permiso(api)
    cid = str(id_ciclo(rid, OCT))
    await api.client.patch(f"/api/v1/reminder-cycles/{cid}", json={"status": "paid"})
    r = await api.client.post(
        "/api/v1/reminder-actions", json={"token": token, "accion": "mas-tarde"}
    )
    assert r.status_code == 204
    ciclo = await _ciclo(api, rid)
    assert ciclo["status"] == "paid" and ciclo["snoozed_until"] is None


async def test_permiso_vencido_o_inventado(api: SimpleNamespace) -> None:
    rid, token = await _aviso_y_permiso(api)
    await api.session.execute(
        text("UPDATE reminder_action_tokens SET expires_at = now() - interval '1 hour'")
    )
    r = await api.client.post("/api/v1/reminder-actions", json={"token": token, "accion": "pagado"})
    assert r.status_code == 404
    r = await api.client.post(
        "/api/v1/reminder-actions", json={"token": "x" * 43, "accion": "pagado"}
    )
    assert r.status_code == 404
    assert (await _ciclo(api, rid))["status"] == "pending"


@pytest.mark.parametrize("cuerpo", [{"token": "corto", "accion": "pagado"}, {"accion": "pagado"}])
async def test_boton_mal_formado(api: SimpleNamespace, cuerpo: dict) -> None:
    r = await api.client.post("/api/v1/reminder-actions", json=cuerpo)
    assert r.status_code == 422


async def test_mas_tarde_no_deshace_un_pago_que_entro_mientras_tanto(
    api: SimpleNamespace,
) -> None:
    # El boton leyo "pendiente", pero el pago entro antes de escribir: el upsert
    # condicional no lo pisa.
    from app.crud import reminder as crud
    from app.schemas.reminder import ReminderCycleCreate

    rid = await _recordatorio(api)
    cid = id_ciclo(rid, OCT)
    await api.client.post(
        "/api/v1/reminder-cycles",
        json={"id": str(cid), "reminder_id": rid, "nominal_date": "2026-10-10", "status": "paid"},
    )
    datos = ReminderCycleCreate(
        id=cid,
        reminder_id=uuid.UUID(rid),
        nominal_date=OCT,
        status="pending",
        snoozed_until=datetime.now(UTC) + timedelta(hours=3),
    )
    ciclo = await crud.guardar_ciclo(api.session, api.owner_id, datos, solo_si_pendiente=True)
    assert ciclo is not None and ciclo.status == "paid" and ciclo.snoozed_until is None
