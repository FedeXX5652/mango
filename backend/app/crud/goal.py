"""Metas de ahorro (fase 5). CRUD plano y personal: el progreso (saldo de la
cuenta asociada) lo calcula el cliente."""

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.budget import Goal
from app.schemas.goal import GoalCreate, GoalUpdate


async def create_goal(session: AsyncSession, owner_id: uuid.UUID, data: GoalCreate) -> Goal:
    goal = Goal(owner_id=owner_id, **data.model_dump())
    session.add(goal)
    await session.commit()
    await session.refresh(goal)
    return goal


async def get_goal(session: AsyncSession, owner_id: uuid.UUID, goal_id: uuid.UUID) -> Goal | None:
    stmt = select(Goal).where(
        Goal.id == goal_id, Goal.owner_id == owner_id, Goal.deleted_at.is_(None)
    )
    return (await session.execute(stmt)).scalar_one_or_none()


async def update_goal(session: AsyncSession, goal: Goal, data: GoalUpdate) -> Goal:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(goal, field, value)
    await session.commit()
    await session.refresh(goal)
    return goal


async def soft_delete_goal(session: AsyncSession, goal: Goal) -> None:
    goal.deleted_at = func.now()
    await session.commit()
