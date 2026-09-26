"""Asignaciones a sobres (presupuesto por sobres, ver 3.6 / 0004).

Una fila = la asignacion de un mes a un sobre (categoria). El calculo de saldo,
arrastre y "por asignar" vive en el cliente (SQLite local); aca solo se guarda
el dato con su validacion de dominio.
"""

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import DomainError
from app.crud.group import membresia
from app.models.budget import Budget
from app.models.category import Category
from app.schemas.budget import BudgetCreate, BudgetUpdate


async def _category_kind_personal(
    session: AsyncSession, owner_id: uuid.UUID, category_id: uuid.UUID
) -> str | None:
    stmt = select(Category.kind).where(
        Category.id == category_id,
        Category.owner_id == owner_id,
        Category.deleted_at.is_(None),
    )
    return (await session.execute(stmt)).scalar_one_or_none()


async def _category_kind_de_grupo(
    session: AsyncSession, group_id: uuid.UUID, category_id: uuid.UUID
) -> str | None:
    stmt = select(Category.kind).where(
        Category.id == category_id,
        Category.group_id == group_id,
        Category.deleted_at.is_(None),
    )
    return (await session.execute(stmt)).scalar_one_or_none()


async def get_budget(
    session: AsyncSession, owner_id: uuid.UUID, budget_id: uuid.UUID
) -> Budget | None:
    """El presupuesto si el usuario lo puede tocar: personal suyo, o de un grupo
    del que es miembro (ver 0015)."""
    budget = (
        await session.execute(
            select(Budget).where(Budget.id == budget_id, Budget.deleted_at.is_(None))
        )
    ).scalar_one_or_none()
    if budget is None:
        return None
    if budget.owner_id == owner_id:
        return budget
    if budget.group_id is not None and await membresia(session, budget.group_id, owner_id):
        return budget
    return None


async def create_budget(session: AsyncSession, owner_id: uuid.UUID, data: BudgetCreate) -> Budget:
    # Ambito: de grupo (miembro, categoria del grupo) o personal.
    if data.group_id is not None:
        if await membresia(session, data.group_id, owner_id) is None:
            raise DomainError("El grupo no existe")
        kind = await _category_kind_de_grupo(session, data.group_id, data.category_id)
        dueno: uuid.UUID | None = None
        grupo: uuid.UUID | None = data.group_id
    else:
        kind = await _category_kind_personal(session, owner_id, data.category_id)
        dueno = owner_id
        grupo = None
    if kind is None:
        raise DomainError("La categoria no existe")
    if kind != "expense":
        raise DomainError("Solo se asigna a sobres de gasto")

    dup = (
        await session.execute(
            select(Budget.id).where(
                Budget.owner_id.is_(dueno) if dueno is None else Budget.owner_id == dueno,
                Budget.group_id.is_(grupo) if grupo is None else Budget.group_id == grupo,
                Budget.category_id == data.category_id,
                # La moneda es parte de la identidad del sobre (ver 0005).
                Budget.currency == data.currency,
                Budget.period_start == data.period_start,
                Budget.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if dup is not None:
        raise DomainError("Ya hay una asignacion para ese sobre, moneda y mes")

    campos = data.model_dump(exclude={"group_id"})
    budget = Budget(owner_id=dueno, group_id=grupo, **campos)
    session.add(budget)
    await session.commit()
    await session.refresh(budget)
    return budget


async def update_budget(session: AsyncSession, budget: Budget, data: BudgetUpdate) -> Budget:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(budget, field, value)
    await session.commit()
    await session.refresh(budget)
    return budget


async def soft_delete_budget(session: AsyncSession, budget: Budget) -> None:
    budget.deleted_at = func.now()
    await session.commit()
