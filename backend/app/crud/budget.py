"""Asignaciones a sobres (presupuesto por sobres, ver 3.6 / 0004).

Una fila = la asignacion de un mes a un sobre (categoria). El calculo de saldo,
arrastre y "por asignar" vive en el cliente (SQLite local); aca solo se guarda
el dato con su validacion de dominio.
"""

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import DomainError
from app.models.budget import Budget
from app.models.category import Category
from app.schemas.budget import BudgetCreate, BudgetUpdate


async def _category_kind(
    session: AsyncSession, owner_id: uuid.UUID, category_id: uuid.UUID
) -> str | None:
    stmt = select(Category.kind).where(
        Category.id == category_id,
        Category.owner_id == owner_id,
        Category.deleted_at.is_(None),
    )
    return (await session.execute(stmt)).scalar_one_or_none()


async def get_budget(
    session: AsyncSession, owner_id: uuid.UUID, budget_id: uuid.UUID
) -> Budget | None:
    stmt = select(Budget).where(
        Budget.id == budget_id,
        Budget.owner_id == owner_id,
        Budget.deleted_at.is_(None),
    )
    return (await session.execute(stmt)).scalar_one_or_none()


async def create_budget(session: AsyncSession, owner_id: uuid.UUID, data: BudgetCreate) -> Budget:
    kind = await _category_kind(session, owner_id, data.category_id)
    if kind is None:
        raise DomainError("La categoria no existe")
    if kind != "expense":
        raise DomainError("Solo se asigna a sobres de gasto")

    dup = (
        await session.execute(
            select(Budget.id).where(
                Budget.owner_id == owner_id,
                Budget.group_id.is_(None),
                Budget.category_id == data.category_id,
                Budget.period_start == data.period_start,
                Budget.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if dup is not None:
        raise DomainError("Ya hay una asignacion para ese sobre y mes")

    budget = Budget(owner_id=owner_id, **data.model_dump())
    session.add(budget)
    await session.commit()
    await session.refresh(budget)
    return budget


async def list_budgets(session: AsyncSession, owner_id: uuid.UUID) -> list[Budget]:
    stmt = (
        select(Budget)
        .where(Budget.owner_id == owner_id, Budget.deleted_at.is_(None))
        .order_by(Budget.period_start.desc())
    )
    return list((await session.execute(stmt)).scalars().all())


async def update_budget(session: AsyncSession, budget: Budget, data: BudgetUpdate) -> Budget:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(budget, field, value)
    await session.commit()
    await session.refresh(budget)
    return budget


async def soft_delete_budget(session: AsyncSession, budget: Budget) -> None:
    budget.deleted_at = func.now()
    await session.commit()
