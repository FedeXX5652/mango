"""Recordatorios de grupo (1.6.0, ver 0030, C3/G3/G4): avisan a todos los
miembros, cualquiera los marca y se frenan para todos, los edita o borra
cualquier miembro, y el "Mas tarde" es de cada uno."""

import json
import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import date, datetime
from types import SimpleNamespace
from zoneinfo import ZoneInfo

from sqlalchemy import select, text

from app.api.deps import get_current_user_id
from app.core.config import settings
from app.main import app
from app.models.user import Notification
from app.services import aviso_recordatorios as servicio
from app.services.repeticion import id_ciclo

TZ = ZoneInfo(settings.tz)
OCT12 = date(2026, 10, 12)  # lunes


def _local(dia: int, hora: int, minuto: int = 0) -> datetime:
    return datetime(2026, 10, dia, hora, minuto, tzinfo=TZ)


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


async def _sumar(api: SimpleNamespace, gid: str, username: str) -> str:
    uid = await _otro_usuario(api, username)
    r = await api.client.post(f"/api/v1/groups/{gid}/members", json={"username": username})
    assert r.status_code == 201, r.text
    return uid


async def _casa(api: SimpleNamespace) -> tuple[str, str]:
    gid = str(uuid.uuid4())
    r = await api.client.post("/api/v1/groups", json={"id": gid, "name": "Casa"})
    assert r.status_code == 201, r.text
    return gid, await _sumar(api, gid, f"beto-{gid[:6]}")


@contextmanager
def _como(uid: str) -> Iterator[None]:
    antes = app.dependency_overrides[get_current_user_id]
    app.dependency_overrides[get_current_user_id] = lambda: uuid.UUID(uid)
    try:
        yield
    finally:
        app.dependency_overrides[get_current_user_id] = antes


async def _recordatorio(api: SimpleNamespace, gid: str, **over) -> str:
    datos = {
        "id": str(uuid.uuid4()),
        "group_id": gid,
        "title": "Expensas",
        "freq": "monthly",
        "month_mode": "day",
        "month_day": 12,
        "start_date": "2026-01-12",
        "weekend_shift": "next",
        "track_from": "2026-10-01",
    }
    datos.update(over)
    r = await api.client.post("/api/v1/reminders", json=datos)
    assert r.status_code == 201, r.text
    return datos["id"]


def _ciclo(rid: str, **over) -> dict:
    datos = {
        "id": str(id_ciclo(uuid.UUID(rid), OCT12)),
        "reminder_id": rid,
        "nominal_date": OCT12.isoformat(),
        "status": "pending",
    }
    datos.update(over)
    return datos


async def _avisos(api: SimpleNamespace, rid: str) -> list[Notification]:
    return list(
        (
            await api.session.execute(
                select(Notification)
                .where(Notification.meta["reminder_id"].astext == rid)
                .order_by(Notification.created_at)
            )
        ).scalars()
    )


async def _fila_ciclo(api: SimpleNamespace, rid: str) -> dict | None:
    return await api.fila("reminder_cycles", id_ciclo(uuid.UUID(rid), OCT12))


# --- El recordatorio ---------------------------------------------------------------


async def test_un_recordatorio_del_grupo(api: SimpleNamespace) -> None:
    gid, _ = await _casa(api)
    plantilla = str(uuid.uuid4())
    r = await api.client.post(
        "/api/v1/templates",
        json={"id": plantilla, "name": "Exp", "kind": "expense", "group_id": gid},
    )
    assert r.status_code == 201, r.text
    personal = str(uuid.uuid4())
    await api.client.post(
        "/api/v1/templates", json={"id": personal, "name": "Mía", "kind": "expense"}
    )
    con_la_del_grupo = await _recordatorio(api, gid, template_id=plantilla)
    con_una_personal = await _recordatorio(api, gid, template_id=personal)
    assert (await api.fila("reminders", con_la_del_grupo))["template_id"] == plantilla
    assert (await api.fila("reminders", con_una_personal))["template_id"] is None
    assert (await api.fila("reminders", con_la_del_grupo))["group_id"] == gid


async def test_no_sigue_una_tarjeta_personal(api: SimpleNamespace) -> None:
    gid, _ = await _casa(api)
    pm = str(uuid.uuid4())
    await api.client.post(
        "/api/v1/payment-methods",
        json={"id": pm, "name": "Visa", "kind": "credit_card", "due_day": 12},
    )
    rid = await _recordatorio(api, gid, payment_method_id=pm)
    assert (await api.fila("reminders", rid))["payment_method_id"] is None


async def test_de_un_grupo_ajeno_no(api: SimpleNamespace) -> None:
    ajeno = await _otro_usuario(api, "ajeno")
    gid = str(uuid.uuid4())
    with _como(ajeno):
        await api.client.post("/api/v1/groups", json={"id": gid, "name": "Ajeno"})
    r = await api.client.post(
        "/api/v1/reminders",
        json={
            "id": str(uuid.uuid4()),
            "group_id": gid,
            "title": "X",
            "freq": "once",
            "start_date": "2026-10-12",
            "weekend_shift": "none",
            "track_from": "2026-10-01",
        },
    )
    assert r.status_code == 422


async def test_cualquier_miembro_lo_edita_o_lo_borra(api: SimpleNamespace) -> None:
    """G4: como las categorias del grupo."""
    gid, beto = await _casa(api)
    rid = await _recordatorio(api, gid)
    with _como(beto):
        r = await api.client.patch(f"/api/v1/reminders/{rid}", json={"title": "Expensas Casa"})
        assert r.status_code == 200, r.text
        assert (await api.client.delete(f"/api/v1/reminders/{rid}")).status_code == 204
    assert (await api.fila("reminders", rid))["deleted_at"] is not None


async def test_quien_no_es_del_grupo_no_lo_toca(api: SimpleNamespace) -> None:
    gid, _ = await _casa(api)
    rid = await _recordatorio(api, gid)
    ajeno = await _otro_usuario(api, "ajeno2")
    with _como(ajeno):
        assert (
            await api.client.patch(f"/api/v1/reminders/{rid}", json={"title": "X"})
        ).status_code == 404
        r = await api.client.post("/api/v1/reminder-cycles", json=_ciclo(rid, status="paid"))
        assert r.status_code == 404


# --- Los avisos --------------------------------------------------------------------


async def test_avisa_a_cada_miembro_con_el_nombre_del_grupo(api: SimpleNamespace) -> None:
    gid, beto = await _casa(api)
    ana = await _sumar(api, gid, f"ana-{gid[:6]}")
    # Ana se va del grupo: no le llega.
    assert (await api.client.delete(f"/api/v1/groups/{gid}/members/{ana}")).status_code == 204
    rid = await _recordatorio(api, gid)
    assert await servicio.avisar(api.session, _local(12, 9)) == 2
    avisos = await _avisos(api, rid)
    assert {str(a.user_id) for a in avisos} == {str(api.owner_id), beto}
    assert {a.title for a in avisos} == {"Casa · Expensas"}
    assert avisos[0].link == f"/grupos/{gid}/calendario?r={rid}&n=2026-10-12"
    ciclo = await _fila_ciclo(api, rid)
    assert ciclo["group_id"] == gid and ciclo["alerts_sent"] == ["0@09:00"]
    # Una sola vez.
    assert await servicio.avisar(api.session, _local(12, 10)) == 0


async def test_cualquiera_lo_marca_y_se_frena_para_todos(api: SimpleNamespace) -> None:
    gid, beto = await _casa(api)
    rid = await _recordatorio(api, gid)
    with _como(beto):
        r = await api.client.post("/api/v1/reminder-cycles", json=_ciclo(rid, status="paid"))
        assert r.status_code == 201, r.text
    ciclo = await _fila_ciclo(api, rid)
    assert ciclo["status"] == "paid"
    assert ciclo["answered_by"] == beto and ciclo["group_id"] == gid
    assert await servicio.avisar(api.session, _local(12, 9)) == 0


# --- "Más tarde" es de cada uno (G3) -----------------------------------------------


async def test_mas_tarde_calla_solo_a_quien_lo_pidio(api: SimpleNamespace) -> None:
    gid, beto = await _casa(api)
    rid = await _recordatorio(api, gid)
    hasta = _local(12, 15)
    with _como(beto):
        r = await api.client.post(
            "/api/v1/reminder-cycles", json=_ciclo(rid, snoozed_until=hasta.isoformat())
        )
        assert r.status_code == 201, r.text
    ciclo = await _fila_ciclo(api, rid)
    assert ciclo["snoozed_until"] is None
    assert list(ciclo["snoozes"]) == [beto]
    # A las 9 le avisa al resto; a Beto no.
    assert await servicio.avisar(api.session, _local(12, 9)) == 1
    assert [str(a.user_id) for a in await _avisos(api, rid)] == [str(api.owner_id)]
    # A las 15 se le cumple a Beto: un "Te lo recuerdo" solo para el.
    assert await servicio.avisar(api.session, _local(12, 15)) == 1
    ultimo = (await _avisos(api, rid))[-1]
    assert str(ultimo.user_id) == beto
    assert ultimo.body.startswith("Te lo recuerdo")
    assert (await _fila_ciclo(api, rid))["snoozes"] == {}
    assert await servicio.avisar(api.session, _local(12, 16)) == 0


async def test_dos_miembros_posponen_sin_pisarse(api: SimpleNamespace) -> None:
    gid, beto = await _casa(api)
    rid = await _recordatorio(api, gid)
    await api.client.post(
        "/api/v1/reminder-cycles", json=_ciclo(rid, snoozed_until=_local(12, 11).isoformat())
    )
    with _como(beto):
        # Por la otra ruta (el dispositivo ya tenia la fila): PATCH.
        cid = str(id_ciclo(uuid.UUID(rid), OCT12))
        r = await api.client.patch(
            f"/api/v1/reminder-cycles/{cid}", json={"snoozed_until": _local(12, 15).isoformat()}
        )
        assert r.status_code == 200, r.text
    assert set((await _fila_ciclo(api, rid))["snoozes"]) == {str(api.owner_id), beto}
    # Beto saca el suyo: el del otro queda.
    with _como(beto):
        await api.client.patch(f"/api/v1/reminder-cycles/{cid}", json={"snoozed_until": None})
    assert list((await _fila_ciclo(api, rid))["snoozes"]) == [str(api.owner_id)]


async def test_responder_deja_sin_efecto_los_mas_tarde(api: SimpleNamespace) -> None:
    gid, beto = await _casa(api)
    rid = await _recordatorio(api, gid)
    with _como(beto):
        await api.client.post(
            "/api/v1/reminder-cycles", json=_ciclo(rid, snoozed_until=_local(12, 15).isoformat())
        )
    await api.client.post("/api/v1/reminder-cycles", json=_ciclo(rid, status="paid"))
    ciclo = await _fila_ciclo(api, rid)
    assert ciclo["status"] == "paid" and ciclo["snoozes"] is None


async def test_los_botones_del_aviso_de_un_miembro(api: SimpleNamespace) -> None:
    gid, beto = await _casa(api)
    rid = await _recordatorio(api, gid)
    await servicio.avisar(api.session, _local(12, 9))
    aviso_de_beto = next(a for a in await _avisos(api, rid) if str(a.user_id) == beto)
    token = (await servicio.acciones_de(api.session, aviso_de_beto))["token"]
    await api.session.flush()
    r = await api.client.post(
        "/api/v1/reminder-actions", json={"token": token, "accion": "mas-tarde"}
    )
    assert r.status_code == 204, r.text
    ciclo = await _fila_ciclo(api, rid)
    assert list(ciclo["snoozes"]) == [beto] and ciclo["status"] == "pending"


async def test_el_mapa_del_telefono_solo_toca_lo_de_quien_lo_sube(api: SimpleNamespace) -> None:
    """El telefono guarda el "Mas tarde" de grupo como el JSON del mapa (texto) y
    lo sube entero: el servidor toma solo la clave de quien lo sube."""
    gid, beto = await _casa(api)
    rid = await _recordatorio(api, gid)
    mio = _local(12, 11).isoformat()
    await api.client.post("/api/v1/reminder-cycles", json=_ciclo(rid, snoozed_until=mio))
    ajeno = str(api.owner_id)
    with _como(beto):
        # Trae una copia vieja de la clave del otro: no la pisa.
        mapa = {beto: _local(12, 15).isoformat(), ajeno: _local(12, 23).isoformat()}
        r = await api.client.post(
            "/api/v1/reminder-cycles", json=_ciclo(rid, snoozes=json.dumps(mapa))
        )
        assert r.status_code == 201, r.text
    snoozes = (await _fila_ciclo(api, rid))["snoozes"]
    assert datetime.fromisoformat(snoozes[ajeno]) == _local(12, 11)
    assert datetime.fromisoformat(snoozes[beto]) == _local(12, 15)
    # Beto lo saca: el mapa que sube ya no tiene su clave.
    cid = str(id_ciclo(uuid.UUID(rid), OCT12))
    with _como(beto):
        r = await api.client.patch(
            f"/api/v1/reminder-cycles/{cid}", json={"snoozes": json.dumps({ajeno: mio})}
        )
        assert r.status_code == 200, r.text
    assert list((await _fila_ciclo(api, rid))["snoozes"]) == [ajeno]


async def test_un_mas_tarde_atrasado_no_deshace_un_pago(api: SimpleNamespace) -> None:
    """Beto pospuso sin conexion; mientras tanto el otro lo pago. Cuando el
    telefono de Beto sube el "Mas tarde" (como alta: no tenia la fila), el pago
    queda."""
    gid, beto = await _casa(api)
    rid = await _recordatorio(api, gid)
    await api.client.post("/api/v1/reminder-cycles", json=_ciclo(rid, status="paid"))
    with _como(beto):
        r = await api.client.post(
            "/api/v1/reminder-cycles",
            json=_ciclo(rid, snoozes=json.dumps({beto: _local(12, 15).isoformat()})),
        )
        assert r.status_code == 201, r.text
    ciclo = await _fila_ciclo(api, rid)
    assert ciclo["status"] == "paid" and ciclo["answered_by"] == str(api.owner_id)
    assert ciclo["snoozes"] is None
