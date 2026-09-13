"""Reglas recurrentes: sueldo, alquiler, servicios. Alta, edicion y baja.

**Generarlas no se hace aca.** La cuenta de que ocurrencia vencio y la creacion
del movimiento viven en el dispositivo (`lib/recurrentes` en el cliente), porque
si dependieran del servidor tu alquiler no existiria hasta que te reconectes.
El servidor solo recibe la regla y los movimientos que la regla produjo, como
cualquier otra escritura.
"""

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud.transaction import _validate_invariants
from app.models.recurring import RecurringRule
from app.schemas.recurring import RecurringCreate, RecurringUpdate


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
