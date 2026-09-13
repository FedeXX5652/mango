"""Asignaciones recurrentes a sobres (ver 3.6 / 0004).

Una regla dice "asigna este monto a este sobre todos los meses". `apply_due`
crea la fila de `budgets` del mes para cada regla activa que todavia
no tenga una: nunca pisa una asignacion hecha a mano. Reemplaza al viejo
`default_budget`. Se dispara desde `/recurring/run`.
"""

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import DomainError
from app.models.budget import BudgetRule
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
                # Un sobre por moneda: la recurrente en pesos y la en dolares
                # son dos reglas distintas (ver 0005).
                BudgetRule.currency == data.currency,
                BudgetRule.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if dup is not None:
        raise DomainError("Ya hay una asignacion recurrente para ese sobre y moneda")

    rule = BudgetRule(owner_id=owner_id, **data.model_dump())
    session.add(rule)
    await session.commit()
    await session.refresh(rule)
    return rule


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
