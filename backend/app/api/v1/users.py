"""Ruta del propio usuario. Fase 1: siempre el usuario semilla (sin auth)."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.crud import user as crud
from app.db import get_session
from app.models.user import User
from app.schemas.user import UserRead, UserUpdate

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserRead)
async def get_me(current: User = Depends(get_current_user)) -> UserRead:
    return current


@router.patch("/me", response_model=UserRead)
async def update_me(
    data: UserUpdate,
    current: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> UserRead:
    return await crud.update_user(session, current, data)
