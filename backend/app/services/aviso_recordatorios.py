"""Los avisos del calendario de pagos, con la base (1.5.0, etapa 2, ver 0030).

- `avisar`: la tarea del planificador. Cada minuto mira que toca avisar
  (`recordatorios.avisos_debidos`), crea los avisos de la bandeja (que el
  despachador manda por push) y anota en el ciclo lo que aviso, para no repetir.
- `acciones_de`: los botones "Ya lo pagué" y "Más tarde" del push, con un permiso
  de un solo uso (el service worker no tiene la sesion).
- `usar_permiso`: lo que hace el servidor cuando se toca un boton.
"""

import hashlib
import secrets
import uuid
from collections import defaultdict
from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import func, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.crud import notification as notif
from app.crud import reminder as crud_recordatorio
from app.models.recurring import Template
from app.models.reminder import Reminder, ReminderActionToken, ReminderCycle
from app.models.user import Group, GroupMember, Notification, User
from app.schemas.reminder import ReminderCycleCreate
from app.services.recordatorios import Aviso, EstadoCiclo, avisos_debidos, texto
from app.services.repeticion import Regla, correr, id_ciclo

TIPO = "recordatorio"
# El permiso de los botones dura una semana: despues, el boton abre la app.
DURACION_PERMISO = timedelta(days=7)
ACCIONES = [
    {"accion": "pagado", "titulo": "Ya lo pagué"},
    {"accion": "mas-tarde", "titulo": "Más tarde"},
]
# Una deuda se salda en la app (cuanto se pago): su aviso no trae "Ya lo pagué".
ACCIONES_DEUDA = [a for a in ACCIONES if a["accion"] != "pagado"]


def regla_de(r: Reminder) -> Regla:
    return Regla(
        freq=r.freq,
        start_date=r.start_date,
        interval_count=r.interval_count,
        weekdays=r.weekdays,
        month_mode=r.month_mode,
        month_day=r.month_day,
        month_week=r.month_week,
        month_weekday=r.month_weekday,
        until_date=r.until_date,
        count=r.count,
        weekend_shift=r.weekend_shift,
    )


def link_de(reminder_id: uuid.UUID, nominal: date, group_id: uuid.UUID | None = None) -> str:
    """Tocar el aviso abre el calendario con ese vencimiento: el del grupo, si es
    de un grupo (G1)."""
    base = f"/grupos/{group_id}/calendario" if group_id else "/calendario"
    return f"{base}?r={reminder_id}&n={nominal.isoformat()}"


async def _ciclo(session: AsyncSession, r: Reminder, nominal: date) -> ReminderCycle:
    """La fila del vencimiento, creandola pendiente si todavia no estaba (mismo id
    determinista que usan los dispositivos)."""
    cid = id_ciclo(r.id, nominal)
    await session.execute(
        insert(ReminderCycle)
        .values(
            id=cid,
            owner_id=r.owner_id,
            group_id=r.group_id,
            reminder_id=r.id,
            nominal_date=nominal,
            status="pending",
        )
        .on_conflict_do_nothing(index_elements=[ReminderCycle.id])
    )
    return (
        await session.execute(select(ReminderCycle).where(ReminderCycle.id == cid))
    ).scalar_one()


async def avisar(session: AsyncSession, ahora: datetime | None = None) -> int:
    """Crea los avisos que tocan ahora. Devuelve cuantos."""
    ahora = (ahora or datetime.now(UTC)).astimezone(ZoneInfo(settings.tz))
    hoy = ahora.date()
    recordatorios = (
        (await session.execute(select(Reminder).where(Reminder.deleted_at.is_(None))))
        .scalars()
        .all()
    )
    if not recordatorios:
        return 0
    por_recordatorio: dict[uuid.UUID, dict[date, ReminderCycle]] = defaultdict(dict)
    filas = (
        (
            await session.execute(
                select(ReminderCycle).where(
                    ReminderCycle.reminder_id.in_([r.id for r in recordatorios]),
                    ReminderCycle.deleted_at.is_(None),
                )
            )
        )
        .scalars()
        .all()
    )
    for c in filas:
        por_recordatorio[c.reminder_id][c.nominal_date] = c
    # Los de grupo avisan a cada miembro (C3), con el nombre del grupo (P2).
    grupos = {r.group_id for r in recordatorios if r.group_id is not None}
    miembros: dict[uuid.UUID, list[uuid.UUID]] = defaultdict(list)
    nombres: dict[uuid.UUID, str] = {}
    if grupos:
        for gid, uid in (
            await session.execute(
                select(GroupMember.group_id, GroupMember.user_id).where(
                    GroupMember.group_id.in_(grupos), GroupMember.deleted_at.is_(None)
                )
            )
        ).all():
            miembros[gid].append(uid)
        nombres = {
            gid: nombre
            for gid, nombre in (
                await session.execute(select(Group.id, Group.name).where(Group.id.in_(grupos)))
            ).all()
        }
    con_plantilla = [r.template_id for r in recordatorios if r.template_id]
    plantillas = {
        t.id: t
        for t in (
            await session.execute(
                select(Template).where(
                    Template.id.in_(con_plantilla), Template.deleted_at.is_(None)
                )
            )
        ).scalars()
    }

    n = 0
    for r in recordatorios:
        ciclos = por_recordatorio[r.id]
        grupo = r.group_id is not None
        estados = {
            nominal: EstadoCiclo(
                status=c.status,
                # En uno de grupo el "Mas tarde" es de cada uno: va abajo.
                snoozed_until=None if grupo else c.snoozed_until,
                alerts_sent=set(c.alerts_sent or []),
                followup_sent_on=c.followup_sent_on,
            )
            for nominal, c in ciclos.items()
        }
        plantilla = plantillas.get(r.template_id) if r.template_id else None
        monto = (
            notif.formatear_monto(plantilla.amount, plantilla.currency or "ARS")
            if plantilla is not None and plantilla.amount
            else None
        )
        titulo = notif.de_grupo(nombres.get(r.group_id), r.title) if grupo else r.title
        # De grupo: a quien se le cumplio el "Mas tarde", un aviso solo para el.
        despiertos: dict[date, set[uuid.UUID]] = defaultdict(set)
        if grupo:
            for nominal, c in list(ciclos.items()):
                if c.status != "pending":
                    continue
                for uid in await _despertar(session, c, ahora):
                    despiertos[nominal].add(uid)
                    if uid not in miembros[r.group_id]:
                        continue
                    a = Aviso(nominal, correr(nominal, r.weekend_shift), "pospuesto", "pospuesto")
                    await notif.crear(
                        session,
                        user_id=uid,
                        tipo=TIPO,
                        title=titulo,
                        body=texto(a, hoy, monto),
                        link=link_de(r.id, nominal, r.group_id),
                        meta={"reminder_id": str(r.id), "nominal": nominal.isoformat()},
                    )
                    n += 1
        debidos = avisos_debidos(
            regla_de(r), r.alerts or [], r.followup_days, r.track_from, estados, ahora
        )
        for a in debidos:
            fila = ciclos.get(a.nominal) or await _ciclo(session, r, a.nominal)
            ciclos[a.nominal] = fila
            if a.clase == "aviso":
                fila.alerts_sent = sorted(set(fila.alerts_sent or []) | {a.clave})
            elif a.clase == "seguimiento":
                fila.followup_sent_on = hoy
            else:
                # Solo si sigue siendo el que se leyo: un "Mas tarde" nuevo que
                # el cliente escribio mientras tanto no se pisa.
                await session.execute(
                    update(ReminderCycle)
                    .where(
                        ReminderCycle.id == fila.id,
                        ReminderCycle.snoozed_until == fila.snoozed_until,
                    )
                    .values(snoozed_until=None, updated_at=func.now())
                    .execution_options(synchronize_session=False)
                )
            if grupo:
                # A cada miembro, salvo a quien lo pospuso (G3) o acaba de
                # recibir su "Te lo recuerdo".
                callados = _callados(fila, ahora) | despiertos[a.nominal]
                destinatarios = [u for u in miembros[r.group_id] if u not in callados]
            else:
                destinatarios = [r.owner_id]
            for uid in destinatarios:
                await notif.crear(
                    session,
                    user_id=uid,
                    tipo=TIPO,
                    title=titulo,
                    body=texto(a, hoy, monto),
                    link=link_de(r.id, a.nominal, r.group_id),
                    meta={"reminder_id": str(r.id), "nominal": a.nominal.isoformat()},
                )
                n += 1
    await session.commit()
    return n


def _callados(c: ReminderCycle, ahora: datetime) -> set[uuid.UUID]:
    """Los miembros que pospusieron este vencimiento y todavia no se les cumplio."""
    return {
        uuid.UUID(uid)
        for uid, hasta in (c.snoozes or {}).items()
        if datetime.fromisoformat(hasta) > ahora
    }


async def _despertar(session: AsyncSession, c: ReminderCycle, ahora: datetime) -> list[uuid.UUID]:
    """Los miembros a los que se les cumplio el "Mas tarde" de este vencimiento.
    Se sacan del mapa de a uno y solo si sigue siendo el que se leyo: un "Mas
    tarde" nuevo que llego mientras tanto no se pisa ni se avisa dos veces."""
    listos = []
    for uid, hasta in (c.snoozes or {}).items():
        if datetime.fromisoformat(hasta) > ahora:
            continue
        hecho = await session.execute(
            update(ReminderCycle)
            .where(ReminderCycle.id == c.id, ReminderCycle.snoozes[uid].astext == hasta)
            .values(snoozes=ReminderCycle.snoozes.op("-")(uid), updated_at=func.now())
            .execution_options(synchronize_session=False)
        )
        if hecho.rowcount:
            listos.append(uuid.UUID(uid))
    return listos


# --- Los botones del push -------------------------------------------------------


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


async def acciones_de(session: AsyncSession, aviso: Notification) -> dict:
    """Los botones de un aviso de recordatorio y su permiso de un solo uso (se
    guarda el hash, no el permiso). Si el aviso no es de un vencimiento, nada."""
    meta = aviso.meta or {}
    if aviso.type != TIPO or "reminder_id" not in meta or "nominal" not in meta:
        return {}
    r = await session.get(Reminder, uuid.UUID(meta["reminder_id"]))
    token = secrets.token_urlsafe(32)
    session.add(
        ReminderActionToken(
            id=uuid.uuid4(),
            token_hash=_hash(token),
            user_id=aviso.user_id,
            reminder_id=uuid.UUID(meta["reminder_id"]),
            nominal_date=date.fromisoformat(meta["nominal"]),
            expires_at=datetime.now(UTC) + DURACION_PERMISO,
        )
    )
    return {"acciones": ACCIONES_DEUDA if r and r.debt_id else ACCIONES, "token": token}


def hasta_por_defecto(preferencia: str | None, ahora: datetime) -> datetime:
    """ "Mas tarde" desde el boton: la preferencia del usuario (3 horas si no
    eligio)."""
    local = ahora.astimezone(ZoneInfo(settings.tz))
    if preferencia == "1h":
        return local + timedelta(hours=1)
    if preferencia == "manana":
        manana = local + timedelta(days=1)
        return manana.replace(hour=9, minute=0, second=0, microsecond=0)
    return local + timedelta(hours=3)


async def usar_permiso(session: AsyncSession, token: str, accion: str) -> bool:
    """Aplica un boton del aviso. False si el permiso no sirve (no existe, ya se
    uso o vencio): el service worker abre la app para responder ahi."""
    fila = (
        await session.execute(
            select(ReminderActionToken)
            .where(ReminderActionToken.token_hash == _hash(token))
            .with_for_update()
        )
    ).scalar_one_or_none()
    ahora = datetime.now(UTC)
    if fila is None or fila.used_at is not None or fila.expires_at < ahora:
        return False
    if accion == "pagado":
        r = await session.get(Reminder, fila.reminder_id)
        if r is not None and r.debt_id is not None:
            # Un permiso de antes de que fuera de una deuda: se salda en la app,
            # y el service worker la abre en ese vencimiento.
            return False
    fila.used_at = ahora
    cid = id_ciclo(fila.reminder_id, fila.nominal_date)
    actual = (
        await session.execute(select(ReminderCycle.status).where(ReminderCycle.id == cid))
    ).scalar_one_or_none()
    datos = {"id": cid, "reminder_id": fila.reminder_id, "nominal_date": fila.nominal_date}
    if accion == "pagado":
        hecho = actual == "paid"
        data = ReminderCycleCreate(**datos, status="paid")
    else:
        # Un aviso viejo no deshace lo que ya se respondio en la app.
        hecho = actual is not None and actual != "pending"
        user = await session.get(User, fila.user_id)
        hasta = hasta_por_defecto(user.snooze_default if user else None, ahora)
        data = ReminderCycleCreate(**datos, status="pending", snoozed_until=hasta)
    if hecho:
        await session.commit()
        return True
    # `guardar_ciclo` confirma (con el permiso ya gastado). El "Mas tarde" solo
    # toca un ciclo pendiente, en la misma sentencia: si mientras tanto se pago
    # desde la app, queda pagado. Si el recordatorio ya no es de esa persona, no
    # hace nada: el permiso se gasta igual.
    guardado = await crud_recordatorio.guardar_ciclo(
        session, fila.user_id, data, solo_si_pendiente=accion != "pagado"
    )
    if guardado is None:
        await session.commit()
    return True
