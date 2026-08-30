"""Reglas recurrentes: sueldo, alquiler, servicios. Se definen una vez y el
sistema genera las transacciones.

`run_due` recorre las reglas activas con `auto_create` cuya `next_run_date` ya
vencio, genera una transaccion por cada ocurrencia pendiente (source='recurring')
y avanza `next_run_date`. Las reglas con `auto_create=False` solo avisarian
(recordatorio); eso queda para mas adelante y por ahora no se procesan.
"""

import calendar
import uuid
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud.transaction import _validate_invariants, create_transaction
from app.models.recurring import RecurringRule
from app.schemas.recurring import RecurringCreate, RecurringUpdate
from app.schemas.transaction import TransactionCreate
from app.services.reports import DEFAULT_TZ


def _add_period(d: date, freq: str, n: int) -> date:
    if freq == "daily":
        return d + timedelta(days=n)
    if freq == "weekly":
        return d + timedelta(weeks=n)
    if freq == "monthly":
        total = d.month - 1 + n
        year = d.year + total // 12
        month = total % 12 + 1
        day = min(d.day, calendar.monthrange(year, month)[1])
        return date(year, month, day)
    # yearly
    try:
        return d.replace(year=d.year + n)
    except ValueError:  # 29/02 -> 28/02
        return d.replace(year=d.year + n, day=28)


async def create_recurring(
    session: AsyncSession, owner_id: uuid.UUID, data: RecurringCreate
) -> RecurringRule:
    # Rechaza de entrada una regla que generaria transacciones invalidas.
    await _validate_invariants(
        session,
        owner_id,
        kind=data.kind,
        account_id=data.account_id,
        transfer_account_id=data.transfer_account_id,
        category_id=data.category_id,
        payment_method_id=data.payment_method_id,
    )
    rule = RecurringRule(owner_id=owner_id, **data.model_dump())
    session.add(rule)
    await session.commit()
    await session.refresh(rule)
    return rule


async def get_recurring(
    session: AsyncSession, owner_id: uuid.UUID, rule_id: uuid.UUID
) -> RecurringRule | None:
    stmt = select(RecurringRule).where(
        RecurringRule.id == rule_id,
        RecurringRule.owner_id == owner_id,
        RecurringRule.deleted_at.is_(None),
    )
    return (await session.execute(stmt)).scalar_one_or_none()


async def list_recurring(session: AsyncSession, owner_id: uuid.UUID) -> list[RecurringRule]:
    stmt = (
        select(RecurringRule)
        .where(RecurringRule.owner_id == owner_id, RecurringRule.deleted_at.is_(None))
        .order_by(RecurringRule.next_run_date)
    )
    return list((await session.execute(stmt)).scalars().all())


async def update_recurring(
    session: AsyncSession, rule: RecurringRule, data: RecurringUpdate
) -> RecurringRule:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(rule, field, value)
    await session.commit()
    await session.refresh(rule)
    return rule


async def soft_delete_recurring(session: AsyncSession, rule: RecurringRule) -> None:
    rule.deleted_at = func.now()
    await session.commit()


def _occurred_at(run_date: date) -> datetime:
    # Mediodia en la zona del usuario: cae en el dia/mes correcto sin ambiguedad.
    return datetime.combine(run_date, time(12, 0), tzinfo=ZoneInfo(DEFAULT_TZ))


async def run_due(session: AsyncSession, owner_id: uuid.UUID, as_of: date) -> list[uuid.UUID]:
    """Genera las transacciones pendientes de las reglas vencidas hasta `as_of`.
    Devuelve los ids creados. Idempotente por fecha: avanza next_run_date."""
    stmt = select(RecurringRule).where(
        RecurringRule.owner_id == owner_id,
        RecurringRule.deleted_at.is_(None),
        RecurringRule.active.is_(True),
        RecurringRule.auto_create.is_(True),
        RecurringRule.next_run_date <= as_of,
    )
    rules = (await session.execute(stmt)).scalars().all()

    created: list[uuid.UUID] = []
    for rule in rules:
        run_date = rule.next_run_date
        while run_date <= as_of and (rule.end_date is None or run_date <= rule.end_date):
            tx_data = TransactionCreate(
                id=uuid.uuid4(),  # lo crea el servidor
                kind=rule.kind,
                occurred_at=_occurred_at(run_date),
                amount=rule.amount,
                currency=rule.currency,
                account_id=rule.account_id,
                transfer_account_id=rule.transfer_account_id,
                category_id=rule.category_id,
                payment_method_id=rule.payment_method_id,
                payee=rule.payee,
                notes=rule.notes,
            )
            tx = await create_transaction(session, owner_id, tx_data, source="recurring")
            created.append(tx.id)
            run_date = _add_period(run_date, rule.frequency, rule.interval_count)

        rule.next_run_date = run_date
    await session.commit()
    return created
