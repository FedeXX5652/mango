"""Calendario de pagos (1.5.0, ver 0030): recordatorios y sus ciclos. Personales
(owner_id); los de grupo llegan en la etapa 3.

Toda la validacion va aca (DomainError, 422) y no solo en los CHECK de la base:
un error de la base llega al cliente como 409, que el conector toma por "ya
aplicado", y la escritura se perderia sin aviso.
"""

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import case, func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import DomainError
from app.models.recurring import Template
from app.models.reminder import Reminder, ReminderCycle
from app.models.transaction import Transaction
from app.schemas.reminder import (
    ReminderCreate,
    ReminderCycleCreate,
    ReminderCycleUpdate,
    ReminderUpdate,
)
from app.services.repeticion import id_ciclo

# --- Recordatorios -----------------------------------------------------------------


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
    session: AsyncSession, owner_id: uuid.UUID, template_id: uuid.UUID | None
) -> uuid.UUID | None:
    """La plantilla, si es mia y sigue viva. Si no, el recordatorio queda sin
    plantilla: es lo mismo que pasa cuando se borra (se desvincula)."""
    if template_id is None:
        return None
    return await session.scalar(
        select(Template.id).where(
            Template.id == template_id,
            Template.owner_id == owner_id,
            Template.deleted_at.is_(None),
        )
    )


async def create_reminder(
    session: AsyncSession, owner_id: uuid.UUID, data: ReminderCreate
) -> Reminder:
    datos = data.model_dump()
    datos["template_id"] = await _plantilla(session, owner_id, data.template_id)
    reminder = Reminder(owner_id=owner_id, **datos)
    validar_regla(reminder)
    session.add(reminder)
    await session.commit()
    await session.refresh(reminder)
    return reminder


async def get_reminder(
    session: AsyncSession,
    owner_id: uuid.UUID,
    reminder_id: uuid.UUID,
    *,
    incluso_borrado: bool = False,
) -> Reminder | None:
    stmt = select(Reminder).where(Reminder.id == reminder_id, Reminder.owner_id == owner_id)
    if not incluso_borrado:
        stmt = stmt.where(Reminder.deleted_at.is_(None))
    return (await session.execute(stmt)).scalar_one_or_none()


async def update_reminder(
    session: AsyncSession, reminder: Reminder, data: ReminderUpdate
) -> Reminder:
    cambios = data.model_dump(exclude_unset=True)
    if "template_id" in cambios:
        cambios["template_id"] = await _plantilla(
            session, reminder.owner_id, cambios["template_id"]
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


# --- Ciclos ------------------------------------------------------------------------


async def _recordatorio_mio(
    session: AsyncSession, user_id: uuid.UUID, reminder_id: uuid.UUID
) -> Reminder | None:
    # Tambien uno borrado: marcar sin conexion un ciclo de un recordatorio que se
    # borro en otro dispositivo no es un error, queda en la historia.
    return (
        await session.execute(
            select(Reminder).where(Reminder.id == reminder_id, Reminder.owner_id == user_id)
        )
    ).scalar_one_or_none()


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
    entro mientras tanto no se deshace."""
    reminder = await _recordatorio_mio(session, user_id, data.reminder_id)
    if reminder is None:
        return None
    if data.id != id_ciclo(data.reminder_id, data.nominal_date):
        raise DomainError("El id del ciclo no corresponde a su recordatorio y fecha")
    pagado = data.status == "paid"
    if pagado:
        await _movimiento_mio(session, user_id, data.transaction_id)
    respondido = data.status != "pending"
    # Responder deja sin efecto el "Mas tarde".
    pospuesto = None if respondido else _pospuesto(data.snoozed_until)

    alta = insert(ReminderCycle).values(
        id=data.id,
        owner_id=reminder.owner_id,
        reminder_id=data.reminder_id,
        nominal_date=data.nominal_date,
        status=data.status,
        transaction_id=data.transaction_id if pagado else None,
        answered_at=func.now() if respondido else None,
        answered_by=user_id if respondido else None,
        snoozed_until=pospuesto,
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
                ReminderCycle.owner_id == user_id,
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
    if estado != "pending":
        ciclo.snoozed_until = None
    elif "snoozed_until" in cambios:
        ciclo.snoozed_until = _pospuesto(cambios["snoozed_until"])
    await session.commit()
    await session.refresh(ciclo)
    return ciclo
