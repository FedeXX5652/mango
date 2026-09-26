"""Rutas de grupos y membresía (fase 3b).

Los datos (grupos, miembros) se LEEN del dispositivo por la sync, no de acá:
estos endpoints son la vía de escritura (crear grupo, agregar/sacar miembros),
igual que el resto de la API (ver ESPECIFICACION §3.11).
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user_id
from app.core.errors import DomainError
from app.crud import group as crud
from app.db import get_session
from app.schemas.group import GroupCreate, GroupRead, GroupUpdate, MemberAdd, MemberRead

router = APIRouter(prefix="/groups", tags=["groups"])


def _422(exc: DomainError) -> HTTPException:
    return HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc))


@router.post("", response_model=GroupRead, status_code=status.HTTP_201_CREATED)
async def create_group(
    data: GroupCreate,
    session: AsyncSession = Depends(get_session),
    user_id: uuid.UUID = Depends(get_current_user_id),
) -> GroupRead:
    grupo = await crud.create_group(session, user_id, data)
    return grupo


@router.patch("/{group_id}", response_model=GroupRead)
async def update_group(
    group_id: uuid.UUID,
    data: GroupUpdate,
    session: AsyncSession = Depends(get_session),
    user_id: uuid.UUID = Depends(get_current_user_id),
) -> GroupRead:
    # Cualquier miembro puede editar el grupo (nombre/color): es un hogar, no una
    # empresa (misma logica que las categorias del grupo, ver 0014).
    if await crud.membresia(session, group_id, user_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Grupo no encontrado")
    grupo = await crud.update_group(session, group_id, data)
    if grupo is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Grupo no encontrado")
    return grupo


@router.post("/{group_id}/members", response_model=MemberRead, status_code=status.HTTP_201_CREATED)
async def add_member(
    group_id: uuid.UUID,
    data: MemberAdd,
    session: AsyncSession = Depends(get_session),
    user_id: uuid.UUID = Depends(get_current_user_id),
) -> MemberRead:
    # Solo el owner administra el grupo. 404 y no 403: a quien no es del grupo no
    # se le confirma que el grupo existe.
    if not await crud.es_owner(session, group_id, user_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Grupo no encontrado")
    try:
        return await crud.add_member(session, group_id, data.username)
    except DomainError as exc:
        raise _422(exc) from exc


@router.delete("/{group_id}/members/{miembro_user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_member(
    group_id: uuid.UUID,
    miembro_user_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user_id: uuid.UUID = Depends(get_current_user_id),
) -> None:
    if not await crud.es_owner(session, group_id, user_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Grupo no encontrado")
    try:
        quitado = await crud.remove_member(session, group_id, miembro_user_id)
    except DomainError as exc:
        raise _422(exc) from exc
    if quitado is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No es miembro")
