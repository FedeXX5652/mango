"""Asignaciones recurrentes a sobres (ver 3.6 / 0004).

Una regla dice "asigna este monto a este sobre todos los meses". `apply_due`
crea la fila de `budgets` del mes de `as_of` para cada regla activa que todavia
no tenga una: nunca pisa una asignacion hecha a mano. Reemplaza al viejo
`default_budget`. Se dispara desde `/recurring/run`.
"""

import uuid
from datetime import date

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import DomainError
from app.models.budget import Budget, BudgetRule
from app.models.category import Category
from app.schemas.budget import BudgetRuleCreate, BudgetRuleUpdate


async def _category_kind(
    session: AsyncSession, owner_id: uuid.UUID, category_id: uuid.UUID
) -> str | None:
    stmt = select(Category.kind).where(
        Category.id == category_id,
        Category.owner_id == owner_id,
        Category.deleted_at.is_(None),
    )
    return (await session.execute(stmt)).scalar_one_or_none()


async def get_rule(
    session: AsyncSession, owner_id: uuid.UUID, rule_id: uuid.UUID
) -> BudgetRule | None:
    stmt = select(BudgetRule).where(
        BudgetRule.id == rule_id,
        BudgetRule.owner_id == owner_id,
        BudgetRule.deleted_at.is_(None),
    )
    return (await session.execute(stmt)).scalar_one_or_none()


async def create_rule(
    session: AsyncSession, owner_id: uuid.UUID, data: BudgetRuleCreate
) -> BudgetRule:
    kind = await _category_kind(session, owner_id, data.category_id)
    if kind is None:
        raise DomainError("La categoria no existe")
    if kind != "expense":
        raise DomainError("Solo se asigna a sobres de gasto")

    dup = (
        await session.execute(
            select(BudgetRule.id).where(
                BudgetRule.owner_id == owner_id,
                BudgetRule.group_id.is_(None),
                BudgetRule.category_id == data.category_id,
                BudgetRule.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if dup is not None:
        raise DomainError("Ya hay una asignacion recurrente para ese sobre")

    rule = BudgetRule(owner_id=owner_id, **data.model_dump())
    session.add(rule)
    await session.commit()
    await session.refresh(rule)
    return rule


async def list_rules(session: AsyncSession, owner_id: uuid.UUID) -> list[BudgetRule]:
    stmt = select(BudgetRule).where(
        BudgetRule.owner_id == owner_id, BudgetRule.deleted_at.is_(None)
    )
    return list((await session.execute(stmt)).scalars().all())


async def update_rule(
    session: AsyncSession, rule: BudgetRule, data: BudgetRuleUpdate
) -> BudgetRule:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(rule, field, value)
    await session.commit()
    await session.refresh(rule)
    return rule


async def soft_delete_rule(session: AsyncSession, rule: BudgetRule) -> None:
    rule.deleted_at = func.now()
    await session.commit()


async def apply_due(session: AsyncSession, owner_id: uuid.UUID, as_of: date) -> list[uuid.UUID]:
    """Crea la asignacion del mes de `as_of` para cada regla activa que aun no
    tenga una fila de budgets ese mes. Devuelve los ids creados. Idempotente:
    correr de nuevo no duplica (respeta la asignacion existente, manual o no)."""
    period_start = as_of.replace(day=1)
    stmt = select(BudgetRule).where(
        BudgetRule.owner_id == owner_id,
        BudgetRule.deleted_at.is_(None),
        BudgetRule.active.is_(True),
    )
    rules = (await session.execute(stmt)).scalars().all()

    created: list[uuid.UUID] = []
    for rule in rules:
        existe = (
            await session.execute(
                select(Budget.id).where(
                    Budget.owner_id == owner_id,
                    Budget.group_id.is_(None),
                    Budget.category_id == rule.category_id,
                    Budget.period_start == period_start,
                    Budget.deleted_at.is_(None),
                )
            )
        ).scalar_one_or_none()
        if existe is not None:
            continue
        budget = Budget(
            id=uuid.uuid4(),  # lo crea el servidor, como las recurrentes de tx
            owner_id=owner_id,
            category_id=rule.category_id,
            period_start=period_start,
            amount=rule.amount,
            currency=rule.currency,
        )
        session.add(budget)
        created.append(budget.id)
    await session.commit()
    return created
