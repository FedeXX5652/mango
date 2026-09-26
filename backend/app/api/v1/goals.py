"""Rutas de metas de ahorro (fase 5). CRUD plano."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user_id
from app.crud import goal as crud
from app.db import get_session
from app.schemas.goal import GoalCreate, GoalRead, GoalUpdate

router = APIRouter(prefix="/goals", tags=["goals"])

_NOT_FOUND = "Meta no encontrada"


@router.post("", response_model=GoalRead, status_code=status.HTTP_201_CREATED)
async def create_goal(
    data: GoalCreate,
    session: AsyncSession = Depends(get_session),
    owner_id: uuid.UUID = Depends(get_current_user_id),
) -> GoalRead:
    return await crud.create_goal(session, owner_id, data)


@router.patch("/{goal_id}", response_model=GoalRead)
async def update_goal(
    goal_id: uuid.UUID,
    data: GoalUpdate,
    session: AsyncSession = Depends(get_session),
    owner_id: uuid.UUID = Depends(get_current_user_id),
) -> GoalRead:
    goal = await crud.get_goal(session, owner_id, goal_id)
    if goal is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_NOT_FOUND)
    return await crud.update_goal(session, goal, data)


@router.delete("/{goal_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_goal(
    goal_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    owner_id: uuid.UUID = Depends(get_current_user_id),
) -> None:
    goal = await crud.get_goal(session, owner_id, goal_id)
    if goal is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_NOT_FOUND)
    await crud.soft_delete_goal(session, goal)
