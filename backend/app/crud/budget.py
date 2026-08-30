"""Presupuestos: monto asignado a una categoria por periodo, y cuanto queda.

'disponible' = asignado - gastado del periodo. El gasto incluye las
subcategorias de la categoria presupuestada (un presupuesto de "Transporte"
suma "Transporte/Colectivo"). Solo cuenta gasto confirmado.

Nota: `rollover` se guarda pero todavia no se aplica (arrastre entre periodos
queda para mas adelante); 'available' es del periodo, sin arrastre.
"""

import uuid
from datetime import date

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import DomainError
from app.models.budget import Budget
from app.models.category import Category
from app.models.transaction import Transaction
from app.schemas.budget import BudgetCreate, BudgetUpdate
from app.services.reports import DEFAULT_TZ


def _period_end(period: str, start: date) -> date:
    if period == "weekly":
        return date.fromordinal(start.toordinal() + 7)
    if period == "monthly":
        return (
            date(start.year + 1, 1, 1)
            if start.month == 12
            else date(start.year, start.month + 1, 1)
        )
    return date(start.year + 1, 1, 1)  # yearly


async def _category_kind(
    session: AsyncSession, owner_id: uuid.UUID, category_id: uuid.UUID
) -> str | None:
    stmt = select(Category.kind).where(
        Category.id == category_id,
        Category.owner_id == owner_id,
        Category.deleted_at.is_(None),
    )
    return (await session.execute(stmt)).scalar_one_or_none()


async def _spent(session: AsyncSession, owner_id: uuid.UUID, budget: Budget) -> int:
    end = _period_end(budget.period, budget.period_start)
    # La categoria presupuestada mas sus subcategorias.
    children = (
        (
            await session.execute(
                select(Category.id).where(
                    Category.parent_id == budget.category_id,
                    Category.deleted_at.is_(None),
                )
            )
        )
        .scalars()
        .all()
    )
    category_ids = [budget.category_id, *children]

    # Fecha local (zona del usuario) para respetar el corte del periodo (8).
    local_date = func.date(func.timezone(DEFAULT_TZ, Transaction.occurred_at))
    stmt = select(func.coalesce(func.sum(Transaction.amount), 0)).where(
        Transaction.owner_id == owner_id,
        Transaction.kind == "expense",
        Transaction.status == "confirmed",
        Transaction.deleted_at.is_(None),
        Transaction.currency == budget.currency,
        Transaction.category_id.in_(category_ids),
        local_date >= budget.period_start,
        local_date < end,
    )
    return int((await session.execute(stmt)).scalar_one())


async def _to_read(session: AsyncSession, owner_id: uuid.UUID, budget: Budget) -> dict:
    spent = await _spent(session, owner_id, budget)
    return {
        "id": budget.id,
        "category_id": budget.category_id,
        "period": budget.period,
        "period_start": budget.period_start,
        "period_end": _period_end(budget.period, budget.period_start),
        "amount": budget.amount,
        "currency": budget.currency,
        "rollover": budget.rollover,
        "spent": spent,
        "available": budget.amount - spent,
        "created_at": budget.created_at,
        "updated_at": budget.updated_at,
    }


async def get_budget(
    session: AsyncSession, owner_id: uuid.UUID, budget_id: uuid.UUID
) -> Budget | None:
    stmt = select(Budget).where(
        Budget.id == budget_id,
        Budget.owner_id == owner_id,
        Budget.deleted_at.is_(None),
    )
    return (await session.execute(stmt)).scalar_one_or_none()


async def create_budget(session: AsyncSession, owner_id: uuid.UUID, data: BudgetCreate) -> dict:
    kind = await _category_kind(session, owner_id, data.category_id)
    if kind is None:
        raise DomainError("La categoria no existe")
    if kind != "expense":
        raise DomainError("El presupuesto debe ser sobre una categoria de gasto")

    dup = (
        await session.execute(
            select(Budget.id).where(
                Budget.owner_id == owner_id,
                Budget.group_id.is_(None),
                Budget.category_id == data.category_id,
                Budget.period == data.period,
                Budget.period_start == data.period_start,
                Budget.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if dup is not None:
        raise DomainError("Ya existe un presupuesto para esa categoria y periodo")

    budget = Budget(owner_id=owner_id, **data.model_dump())
    session.add(budget)
    await session.commit()
    await session.refresh(budget)
    return await _to_read(session, owner_id, budget)


async def list_budgets(session: AsyncSession, owner_id: uuid.UUID) -> list[dict]:
    stmt = (
        select(Budget)
        .where(Budget.owner_id == owner_id, Budget.deleted_at.is_(None))
        .order_by(Budget.period_start.desc())
    )
    budgets = (await session.execute(stmt)).scalars().all()
    return [await _to_read(session, owner_id, b) for b in budgets]


async def read_budget(session: AsyncSession, owner_id: uuid.UUID, budget: Budget) -> dict:
    return await _to_read(session, owner_id, budget)


async def update_budget(
    session: AsyncSession, owner_id: uuid.UUID, budget: Budget, data: BudgetUpdate
) -> dict:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(budget, field, value)
    await session.commit()
    await session.refresh(budget)
    return await _to_read(session, owner_id, budget)


async def soft_delete_budget(session: AsyncSession, budget: Budget) -> None:
    budget.deleted_at = func.now()
    await session.commit()
