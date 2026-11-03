"""Metas de ahorro (fase 5). El progreso (saldo de la cuenta asociada) lo calcula
el cliente.

Personales o de un grupo (1.15.0). La de un grupo se sigue contra una cuenta
conjunta del grupo, porque la plata es de todos, y la edita o borra cualquier
miembro, como las plantillas del grupo.

La validacion va aca (DomainError, 422): un error de la base llega al cliente
como 409, que el conector toma por "ya aplicado".
"""

import uuid

from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import DomainError
from app.crud._borrado import vivo
from app.crud.group import membresia
from app.models.account import Account
from app.models.budget import Goal
from app.models.user import GroupMember
from app.schemas.goal import GoalCreate, GoalUpdate


async def _validar_grupo(session: AsyncSession, user_id: uuid.UUID, goal: Goal) -> None:
    """La meta de un grupo: soy miembro y, si tiene cuenta, es una conjunta del
    grupo. Una personal no se valida (como hasta la 1.14)."""
    if goal.group_id is None:
        return
    if await membresia(session, goal.group_id, user_id) is None:
        raise DomainError("El grupo no existe")
    if goal.account_id is not None:
        cuenta = await session.get(Account, goal.account_id)
        if cuenta is None or cuenta.group_id != goal.group_id or cuenta.deleted_at is not None:
            raise DomainError("La meta de un grupo va con una cuenta conjunta del grupo")


async def create_goal(session: AsyncSession, owner_id: uuid.UUID, data: GoalCreate) -> Goal:
    goal = Goal(owner_id=owner_id, **data.model_dump())
    await _validar_grupo(session, owner_id, goal)
    session.add(goal)
    await session.commit()
    await session.refresh(goal)
    return goal


async def get_goal(
    session: AsyncSession, user_id: uuid.UUID, goal_id: uuid.UUID, *, incluso_borrado: bool = False
) -> Goal | None:
    """La meta, si es mia (personal) o de un grupo del que soy miembro."""
    mis_grupos = select(GroupMember.group_id).where(
        GroupMember.user_id == user_id, GroupMember.deleted_at.is_(None)
    )
    stmt = select(Goal).where(
        Goal.id == goal_id,
        vivo(Goal, incluso_borrado),
        or_(
            and_(Goal.group_id.is_(None), Goal.owner_id == user_id),
            Goal.group_id.in_(mis_grupos),
        ),
    )
    return (await session.execute(stmt)).scalar_one_or_none()


async def update_goal(
    session: AsyncSession, user_id: uuid.UUID, goal: Goal, data: GoalUpdate
) -> Goal:
    cambios = data.model_dump(exclude_unset=True)
    for field, value in cambios.items():
        setattr(goal, field, value)
    if "account_id" in cambios:
        await _validar_grupo(session, user_id, goal)
    await session.commit()
    await session.refresh(goal)
    return goal


async def soft_delete_goal(session: AsyncSession, goal: Goal) -> None:
    goal.deleted_at = func.now()
    await session.commit()
