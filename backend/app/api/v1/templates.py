"""Rutas de plantillas. `apply` materializa la plantilla en una transaccion."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user_id
from app.core.errors import DomainError
from app.crud import template as crud
from app.db import get_session
from app.schemas.template import TemplateApply, TemplateCreate, TemplateRead, TemplateUpdate
from app.schemas.transaction import TransactionRead

router = APIRouter(prefix="/templates", tags=["templates"])

_NOT_FOUND = "Plantilla no encontrada"


@router.post("", response_model=TemplateRead, status_code=status.HTTP_201_CREATED)
async def create_template(
    data: TemplateCreate,
    session: AsyncSession = Depends(get_session),
    owner_id: uuid.UUID = Depends(get_current_user_id),
) -> TemplateRead:
    return await crud.create_template(session, owner_id, data)


@router.get("", response_model=list[TemplateRead])
async def list_templates(
    session: AsyncSession = Depends(get_session),
    owner_id: uuid.UUID = Depends(get_current_user_id),
) -> list[TemplateRead]:
    return await crud.list_templates(session, owner_id)


@router.get("/{template_id}", response_model=TemplateRead)
async def get_template(
    template_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    owner_id: uuid.UUID = Depends(get_current_user_id),
) -> TemplateRead:
    template = await crud.get_template(session, owner_id, template_id)
    if template is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_NOT_FOUND)
    return template


@router.patch("/{template_id}", response_model=TemplateRead)
async def update_template(
    template_id: uuid.UUID,
    data: TemplateUpdate,
    session: AsyncSession = Depends(get_session),
    owner_id: uuid.UUID = Depends(get_current_user_id),
) -> TemplateRead:
    template = await crud.get_template(session, owner_id, template_id)
    if template is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_NOT_FOUND)
    return await crud.update_template(session, template, data)


@router.delete("/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_template(
    template_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    owner_id: uuid.UUID = Depends(get_current_user_id),
) -> None:
    template = await crud.get_template(session, owner_id, template_id)
    if template is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_NOT_FOUND)
    await crud.soft_delete_template(session, template)


@router.post(
    "/{template_id}/apply", response_model=TransactionRead, status_code=status.HTTP_201_CREATED
)
async def apply_template(
    template_id: uuid.UUID,
    data: TemplateApply,
    session: AsyncSession = Depends(get_session),
    owner_id: uuid.UUID = Depends(get_current_user_id),
) -> TransactionRead:
    template = await crud.get_template(session, owner_id, template_id)
    if template is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_NOT_FOUND)
    try:
        return await crud.apply_template(session, owner_id, template, data)
    except DomainError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)
        ) from exc
