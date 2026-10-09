"""Deudas y prestamos fuera de un grupo (fase 5). Plata que le debo a alguien o
que me deben, con saldado parcial. Personal (owner_id)."""

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import DomainError
from app.crud import reminder as recordatorios
from app.models.debt import Debt
from app.schemas.debt import DebtCreate, DebtUpdate


async def create_debt(session: AsyncSession, owner_id: uuid.UUID, data: DebtCreate) -> Debt:
    debt = Debt(owner_id=owner_id, **data.model_dump())
    session.add(debt)
    await session.commit()
    await session.refresh(debt)
    return debt


async def get_debt(session: AsyncSession, owner_id: uuid.UUID, debt_id: uuid.UUID) -> Debt | None:
    stmt = select(Debt).where(
        Debt.id == debt_id, Debt.owner_id == owner_id, Debt.deleted_at.is_(None)
    )
    return (await session.execute(stmt)).scalar_one_or_none()


async def update_debt(session: AsyncSession, debt: Debt, data: DebtUpdate) -> Debt:
    fecha_antes = debt.due_date
    saldada_antes = debt.amount_settled >= debt.amount
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(debt, field, value)
    if debt.amount_settled > debt.amount:
        raise DomainError("Lo saldado no puede superar el total")
    # Saldada del todo => se marca la fecha; si se reabre (baja lo saldado), se limpia.
    debt.settled_at = func.now() if debt.amount_settled >= debt.amount else None
    # Su recordatorio de "Avisarme" la sigue (1.6.0).
    await recordatorios.seguir_deuda(
        session, debt, fecha_antes=fecha_antes, saldada_antes=saldada_antes
    )
    await session.commit()
    await session.refresh(debt)
    return debt


async def soft_delete_debt(session: AsyncSession, debt: Debt) -> None:
    debt.deleted_at = func.now()
    await recordatorios.borrar_vinculados(session, debt_id=debt.id)
    await session.commit()
