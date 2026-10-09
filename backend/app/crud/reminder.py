"""Calendario de pagos (1.5.0, ver 0030): recordatorios y sus ciclos.

Personales (owner_id) o de un grupo (1.6.0, C3): uno de grupo lo ve, lo edita y lo
responde cualquier miembro (G4), y su "Mas tarde" es de cada uno (G3,
`reminder_cycles.snoozes`). Uno personal puede seguir a una tarjeta o a una deuda
("Avisarme", 1.6.0): ver "Recordatorios vinculados".

Toda la validacion va aca (DomainError, 422) y no solo en los CHECK de la base:
un error de la base llega al cliente como 409, que el conector toma por "ya
aplicado", y la escritura se perderia sin aviso.
"""

import uuid
from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import and_, case, func, or_, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.errors import DomainError
from app.crud.group import membresia
from app.models.account import PaymentMethod
from app.models.debt import Debt
from app.models.recurring import Template
from app.models.reminder import Reminder, ReminderCycle
from app.models.transaction import Transaction
from app.models.user import GroupMember
from app.schemas.reminder import (
    ReminderCreate,
    ReminderCycleCreate,
    ReminderCycleUpdate,
    ReminderUpdate,
)
from app.services.repeticion import id_ciclo

# --- Recordatorios -----------------------------------------------------------------


def _mis_grupos(user_id: uuid.UUID):
    return select(GroupMember.group_id).where(
        GroupMember.user_id == user_id, GroupMember.deleted_at.is_(None)
    )


def _accesible(modelo, user_id: uuid.UUID):
    """Personal y mio, o de un grupo del que soy miembro."""
    return or_(
        and_(modelo.group_id.is_(None), modelo.owner_id == user_id),
        modelo.group_id.in_(_mis_grupos(user_id)),
    )


def validar_regla(r: Reminder) -> None:
    """Cada frecuencia usa sus campos y no los de otra, y el fin es uno solo."""
    if r.freq == "weekly":
        if not r.weekdays:
            raise DomainError("Elegí al menos un día de la semana")
    elif r.weekdays is not None:
        raise DomainError("Los días de la semana son para repetir cada semana")

    del_mes = (r.month_mode, r.month_day, r.month_week, r.month_weekday)
    if r.freq == "monthly":
        if r.month_mode == "day":
            if r.month_day is None:
                raise DomainError("Falta el día del mes")
            if r.month_week is not None or r.month_weekday is not None:
                raise DomainError("Un recordatorio por día del mes no lleva semana")
        elif r.month_mode == "weekday":
            if r.month_week is None or r.month_weekday is None:
                raise DomainError("Falta qué semana y qué día de la semana")
            if r.month_day is not None:
                raise DomainError("Un recordatorio por día de la semana no lleva día del mes")
        else:
            raise DomainError("Falta cómo se repite en el mes")
    elif any(v is not None for v in del_mes):
        raise DomainError("El día del mes es para repetir cada mes")

    if r.count is not None and r.until_date is not None:
        raise DomainError("Elegí un solo fin: una cantidad de veces o una fecha")
    if r.until_date is not None and r.until_date < r.start_date:
        raise DomainError("La fecha de fin es anterior al primer vencimiento")


async def _plantilla(
    session: AsyncSession,
    owner_id: uuid.UUID,
    template_id: uuid.UUID | None,
    group_id: uuid.UUID | None = None,
) -> uuid.UUID | None:
    """La plantilla del mismo ambito, si sigue viva: una personal mia, o una del
    grupo del recordatorio. Si no, el recordatorio queda sin plantilla: es lo
    mismo que pasa cuando se borra (se desvincula)."""
    if template_id is None:
        return None
    ambito = (
        Template.group_id == group_id
        if group_id is not None
        else and_(Template.group_id.is_(None), Template.owner_id == owner_id)
    )
    return await session.scalar(
        select(Template.id).where(Template.id == template_id, ambito, Template.deleted_at.is_(None))
    )


async def _tarjeta(
    session: AsyncSession, owner_id: uuid.UUID, pm_id: uuid.UUID | None
) -> uuid.UUID | None:
    """La tarjeta de credito, si es mia y sigue en uso. Si no (se borro o archivo
    en otro dispositivo), el recordatorio queda sin vinculo, como con la
    plantilla."""
    if pm_id is None:
        return None
    return await session.scalar(
        select(PaymentMethod.id).where(
            PaymentMethod.id == pm_id,
            PaymentMethod.owner_id == owner_id,
            PaymentMethod.kind == "credit_card",
            PaymentMethod.archived.is_(False),
            PaymentMethod.deleted_at.is_(None),
        )
    )


async def _deuda(
    session: AsyncSession, owner_id: uuid.UUID, debt_id: uuid.UUID | None
) -> uuid.UUID | None:
    """La deuda, si es mia y sigue viva. Si no, sin vinculo."""
    if debt_id is None:
        return None
    return await session.scalar(
        select(Debt.id).where(
            Debt.id == debt_id, Debt.owner_id == owner_id, Debt.deleted_at.is_(None)
        )
    )


async def create_reminder(
    session: AsyncSession, owner_id: uuid.UUID, data: ReminderCreate
) -> Reminder:
    if data.payment_method_id is not None and data.debt_id is not None:
        raise DomainError("Un recordatorio sigue a una tarjeta o a una deuda, no a las dos")
    if data.group_id is not None and await membresia(session, data.group_id, owner_id) is None:
        raise DomainError("El grupo no existe")
    datos = data.model_dump()
    datos["template_id"] = await _plantilla(session, owner_id, data.template_id, data.group_id)
    # La tarjeta y la deuda son personales: uno de grupo no las sigue.
    personal = data.group_id is None
    datos["payment_method_id"] = (
        await _tarjeta(session, owner_id, data.payment_method_id) if personal else None
    )
    datos["debt_id"] = await _deuda(session, owner_id, data.debt_id) if personal else None
    reminder = Reminder(owner_id=owner_id, **datos)
    validar_regla(reminder)
    session.add(reminder)
    await session.commit()
    await session.refresh(reminder)
    return reminder


async def get_reminder(
    session: AsyncSession,
    user_id: uuid.UUID,
    reminder_id: uuid.UUID,
    *,
    incluso_borrado: bool = False,
) -> Reminder | None:
    """Uno mio, o de un grupo mio: cualquier miembro lo edita o lo borra (G4)."""
    stmt = select(Reminder).where(Reminder.id == reminder_id, _accesible(Reminder, user_id))
    if not incluso_borrado:
        stmt = stmt.where(Reminder.deleted_at.is_(None))
    return (await session.execute(stmt)).scalar_one_or_none()


async def update_reminder(
    session: AsyncSession, reminder: Reminder, data: ReminderUpdate
) -> Reminder:
    cambios = data.model_dump(exclude_unset=True)
    if "template_id" in cambios:
        cambios["template_id"] = await _plantilla(
            session, reminder.owner_id, cambios["template_id"], reminder.group_id
        )
    for campo, valor in cambios.items():
        setattr(reminder, campo, valor)
    validar_regla(reminder)
    await session.commit()
    await session.refresh(reminder)
    return reminder


async def soft_delete_reminder(session: AsyncSession, reminder: Reminder) -> None:
    # Los ciclos quedan: son la historia de lo que se pago.
    reminder.deleted_at = func.now()
    await session.commit()


# --- Recordatorios vinculados (1.6.0) -----------------------------------------------
#
# "Avisarme" en una tarjeta o en una deuda crea un recordatorio que la sigue. Lo
# mantiene el servidor, en la misma transaccion que el cambio de la tarjeta o de
# la deuda: vale venga de donde venga el cambio (cualquier dispositivo o la API).
# Ninguna de estas funciones confirma: lo hace quien cambio la tarjeta o la deuda.
#
# Solo se corre la regla que "Avisarme" armo (mensual por dia del mes, para una
# tarjeta; de una vez, para una deuda). Si la persona le cambio la forma en el
# formulario, la regla es suya; igual se borra con la tarjeta o la deuda.


def _hoy() -> date:
    return datetime.now(ZoneInfo(settings.tz)).date()


async def borrar_vinculados(
    session: AsyncSession,
    *,
    payment_method_id: uuid.UUID | None = None,
    debt_id: uuid.UUID | None = None,
) -> None:
    """Se borro (o archivo) la tarjeta, o se borro la deuda: sus recordatorios
    tambien. Los ciclos quedan, como al borrar uno a mano."""
    vinculo = (
        Reminder.payment_method_id == payment_method_id
        if payment_method_id is not None
        else Reminder.debt_id == debt_id
    )
    await session.execute(
        update(Reminder)
        .where(vinculo, Reminder.deleted_at.is_(None))
        .values(deleted_at=func.now(), updated_at=func.now())
    )


async def seguir_tarjeta(session: AsyncSession, pm: PaymentMethod) -> None:
    """La tarjeta cambio su dia de vencimiento: sus recordatorios lo siguen.
    Cambiar la regla cuenta lo vencido desde hoy (como en el formulario)."""
    if pm.due_day is None:
        return
    await session.execute(
        update(Reminder)
        .where(
            Reminder.payment_method_id == pm.id,
            Reminder.deleted_at.is_(None),
            Reminder.freq == "monthly",
            Reminder.month_mode == "day",
            Reminder.month_day.is_distinct_from(pm.due_day),
        )
        .values(month_day=pm.due_day, track_from=_hoy(), updated_at=func.now())
    )


async def seguir_deuda(
    session: AsyncSession, debt: Debt, *, fecha_antes: date | None, saldada_antes: bool
) -> None:
    """La deuda cambio. Sin fecha, su recordatorio no tiene que avisar: se borra.
    Con otra fecha, se mueve. Saldada del todo, su vencimiento queda pagado."""
    if debt.due_date is None:
        await borrar_vinculados(session, debt_id=debt.id)
        return
    vinculados = (Reminder.debt_id == debt.id, Reminder.deleted_at.is_(None))
    if debt.due_date != fecha_antes:
        # Una fecha pasada cuenta desde ahi (como al crearlo): la deuda ya vencio.
        await session.execute(
            update(Reminder)
            .where(*vinculados, Reminder.freq == "once")
            .values(
                start_date=debt.due_date,
                track_from=min(debt.due_date, _hoy()),
                updated_at=func.now(),
            )
        )
    if debt.amount_settled >= debt.amount and not saldada_antes:
        for r in (
            await session.execute(select(Reminder).where(*vinculados, Reminder.freq == "once"))
        ).scalars():
            await _marcar_pagado(session, r, debt.owner_id)


async def _marcar_pagado(session: AsyncSession, r: Reminder, user_id: uuid.UUID) -> None:
    """El vencimiento unico de `r` queda pagado (upsert por el id determinista,
    como cuando lo marca la persona). Lo ya pagado no se toca."""
    alta = insert(ReminderCycle).values(
        id=id_ciclo(r.id, r.start_date),
        owner_id=r.owner_id,
        reminder_id=r.id,
        nominal_date=r.start_date,
        status="paid",
        answered_at=func.now(),
        answered_by=user_id,
    )
    await session.execute(
        alta.on_conflict_do_update(
            index_elements=[ReminderCycle.id],
            set_={
                "status": "paid",
                "answered_at": func.now(),
                "answered_by": user_id,
                "snoozed_until": None,
                "deleted_at": None,
                "updated_at": func.now(),
            },
            where=ReminderCycle.status != "paid",
        )
    )


# --- Ciclos ------------------------------------------------------------------------


async def _recordatorio_accesible(
    session: AsyncSession, user_id: uuid.UUID, reminder_id: uuid.UUID
) -> Reminder | None:
    # Tambien uno borrado: marcar sin conexion un ciclo de un recordatorio que se
    # borro en otro dispositivo no es un error, queda en la historia.
    return (
        await session.execute(
            select(Reminder).where(Reminder.id == reminder_id, _accesible(Reminder, user_id))
        )
    ).scalar_one_or_none()


def _el_mio(mapa: dict[str, str | None] | None, user_id: uuid.UUID) -> datetime | None:
    """Del mapa de "Mas tarde" que subio un telefono, el de quien lo subio."""
    valor = (mapa or {}).get(str(user_id))
    if not valor:
        return None
    try:
        return datetime.fromisoformat(valor)
    except ValueError as exc:
        raise DomainError("La hora del «Más tarde» no se entiende") from exc


def _snoozes_nuevos(user_id: uuid.UUID, respondido: bool, pospuesto: datetime | None):
    """El "Mas tarde" de cada uno en un vencimiento de grupo (G3), en una sola
    expresion: dos miembros que posponen a la vez no se pisan. Responder lo deja
    sin efecto para todos."""
    if respondido:
        return None
    if pospuesto is not None:
        return func.coalesce(ReminderCycle.snoozes, func.jsonb_build_object()).op("||")(
            func.jsonb_build_object(str(user_id), pospuesto.isoformat())
        )
    return ReminderCycle.snoozes.op("-")(str(user_id))


async def _movimiento_mio(
    session: AsyncSession, user_id: uuid.UUID, transaction_id: uuid.UUID | None
) -> None:
    if transaction_id is None:
        return
    mio = await session.scalar(
        select(Transaction.id).where(
            Transaction.id == transaction_id, Transaction.owner_id == user_id
        )
    )
    if mio is None:
        raise DomainError("El pago no es un movimiento tuyo")


# Hasta cuanto se puede posponer un vencimiento.
_POSPONER_MAX = timedelta(days=60)


def _pospuesto(momento: datetime | None) -> datetime | None:
    """ "Mas tarde": a cualquier hora, hasta dos meses. Uno ya pasado se acepta (se
    subio tarde, sin conexion): avisa en la proxima vuelta del planificador."""
    if momento is None:
        return None
    if momento.tzinfo is None:
        momento = momento.replace(tzinfo=UTC)
    if momento - datetime.now(UTC) > _POSPONER_MAX:
        raise DomainError("Se puede posponer hasta dos meses")
    return momento


async def guardar_ciclo(
    session: AsyncSession,
    user_id: uuid.UUID,
    data: ReminderCycleCreate,
    *,
    solo_si_pendiente: bool = False,
) -> ReminderCycle | None:
    """Alta o actualizacion en una sola sentencia (upsert por id). El id es
    determinista: si dos dispositivos marcan el mismo ciclo, el segundo
    actualiza la fila del primero en vez de chocar (un 409 se perderia). Devuelve
    None si el recordatorio no es del usuario.

    `solo_si_pendiente`: si la fila ya existe, solo la toca si sigue pendiente,
    en la misma sentencia. Es el "Mas tarde" del boton del aviso: un pago que
    entro mientras tanto no se deshace. Vale tambien para un "Mas tarde" que
    sube un telefono (1.6.0): pudo posponerlo sin conexion despues de que otro
    dispositivo, u otro miembro, lo marcara pagado. Un "Deshacer" (pendiente sin
    "Mas tarde") si vuelve atras lo respondido: es lo que se pidio."""
    reminder = await _recordatorio_accesible(session, user_id, data.reminder_id)
    if reminder is None:
        return None
    grupo = reminder.group_id is not None
    if data.id != id_ciclo(data.reminder_id, data.nominal_date):
        raise DomainError("El id del ciclo no corresponde a su recordatorio y fecha")
    pagado = data.status == "paid"
    if pagado:
        await _movimiento_mio(session, user_id, data.transaction_id)
    respondido = data.status != "pending"
    # Responder deja sin efecto el "Mas tarde". En uno de grupo puede venir en el
    # mapa de cada uno (lo que guarda el telefono).
    pedido = data.snoozed_until
    if grupo and pedido is None:
        pedido = _el_mio(data.snoozes, user_id)
    pospuesto = None if respondido else _pospuesto(pedido)
    solo_si_pendiente = solo_si_pendiente or pospuesto is not None

    alta = insert(ReminderCycle).values(
        id=data.id,
        owner_id=reminder.owner_id,
        group_id=reminder.group_id,
        reminder_id=data.reminder_id,
        nominal_date=data.nominal_date,
        status=data.status,
        transaction_id=data.transaction_id if pagado else None,
        answered_at=func.now() if respondido else None,
        answered_by=user_id if respondido else None,
        # En uno de grupo el "Mas tarde" es de cada uno: va en `snoozes`.
        snoozed_until=None if grupo else pospuesto,
        snoozes={str(user_id): pospuesto.isoformat()} if grupo and pospuesto else None,
    )
    nueva = alta.excluded
    mismo_estado = ReminderCycle.status == nueva.status
    stmt = (
        alta.on_conflict_do_update(
            index_elements=[ReminderCycle.id],
            set_={
                "status": nueva.status,
                # Marcar "ya lo pague" sin movimiento no borra el que cargo otro.
                "transaction_id": case(
                    (
                        nueva.status == "paid",
                        func.coalesce(nueva.transaction_id, ReminderCycle.transaction_id),
                    ),
                    else_=None,
                ),
                # Si el estado no cambia, queda quien respondio primero y cuando.
                "answered_at": case(
                    (nueva.status == "pending", None),
                    (mismo_estado, ReminderCycle.answered_at),
                    else_=func.now(),
                ),
                "answered_by": case(
                    (nueva.status == "pending", None),
                    (mismo_estado, ReminderCycle.answered_by),
                    else_=nueva.answered_by,
                ),
                "snoozed_until": nueva.snoozed_until,
                "snoozes": (
                    _snoozes_nuevos(user_id, respondido, pospuesto)
                    if grupo
                    else ReminderCycle.snoozes
                ),
                "deleted_at": None,
                "updated_at": func.now(),
            },
            where=(ReminderCycle.status == "pending") if solo_si_pendiente else None,
        )
        .returning(ReminderCycle)
        .execution_options(populate_existing=True)
    )
    ciclo = (await session.execute(stmt)).scalar_one_or_none()
    if ciclo is None:
        # No era pendiente (solo_si_pendiente): queda como estaba.
        ciclo = (
            await session.execute(
                select(ReminderCycle)
                .where(ReminderCycle.id == data.id)
                .execution_options(populate_existing=True)
            )
        ).scalar_one()
    await session.commit()
    return ciclo


async def get_ciclo(
    session: AsyncSession, user_id: uuid.UUID, ciclo_id: uuid.UUID
) -> ReminderCycle | None:
    return (
        await session.execute(
            select(ReminderCycle).where(
                ReminderCycle.id == ciclo_id,
                _accesible(ReminderCycle, user_id),
                ReminderCycle.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()


async def update_ciclo(
    session: AsyncSession, user_id: uuid.UUID, ciclo: ReminderCycle, data: ReminderCycleUpdate
) -> ReminderCycle:
    cambios = data.model_dump(exclude_unset=True)
    estado = cambios.get("status", ciclo.status)
    if estado != ciclo.status:
        ciclo.status = estado
        ciclo.answered_at = None if estado == "pending" else func.now()
        ciclo.answered_by = None if estado == "pending" else user_id
    if estado != "paid":
        # Deshacer u omitir suelta el pago: el movimiento queda, como cualquiera.
        ciclo.transaction_id = None
    elif "transaction_id" in cambios and cambios["transaction_id"] is not None:
        await _movimiento_mio(session, user_id, cambios["transaction_id"])
        ciclo.transaction_id = cambios["transaction_id"]
    if ciclo.group_id is not None:
        # De grupo: el "Mas tarde" es de cada uno, en una sola sentencia.
        if estado != "pending" or "snoozed_until" in cambios or "snoozes" in cambios:
            pedido = (
                cambios["snoozed_until"]
                if "snoozed_until" in cambios
                else _el_mio(cambios.get("snoozes"), user_id)
            )
            pospuesto = None if estado != "pending" else _pospuesto(pedido)
            await session.execute(
                update(ReminderCycle)
                .where(ReminderCycle.id == ciclo.id)
                .values(
                    snoozes=_snoozes_nuevos(user_id, estado != "pending", pospuesto),
                    snoozed_until=None,
                    updated_at=func.now(),
                )
                .execution_options(synchronize_session=False)
            )
    elif estado != "pending":
        ciclo.snoozed_until = None
    elif "snoozed_until" in cambios:
        ciclo.snoozed_until = _pospuesto(cambios["snoozed_until"])
    await session.commit()
    await session.refresh(ciclo)
    return ciclo
