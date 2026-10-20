"""Rutas de quien mas puso plata en un gasto compartido (1.8.0, ver 0032)."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user_id
from app.core.errors import DomainError
from app.crud import payer as crud
from app.db import get_session
from app.schemas.payer import PayerCreate, PayerRead, PayerUpdate
from app.schemas.reminder import AccionDelAviso
from app.services import aviso_pagos

router = APIRouter(prefix="/transaction-payers", tags=["payers"])

_NOT_FOUND = "Pago no encontrado"


def _422(exc: DomainError) -> HTTPException:
    return HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc))


@router.post("", response_model=PayerRead, status_code=status.HTTP_201_CREATED)
async def create_payer(
    data: PayerCreate,
    session: AsyncSession = Depends(get_session),
    owner_id: uuid.UUID = Depends(get_current_user_id),
) -> PayerRead:
    try:
        return await crud.create_payer(session, owner_id, data)
    except DomainError as exc:
        raise _422(exc) from exc


@router.patch("/{payer_id}", response_model=PayerRead)
async def update_payer(
    payer_id: uuid.UUID,
    data: PayerUpdate,
    session: AsyncSession = Depends(get_session),
    owner_id: uuid.UUID = Depends(get_current_user_id),
) -> PayerRead:
    payer = await crud.get_payer(session, owner_id, payer_id)
    if payer is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_NOT_FOUND)
    return await crud.update_payer(session, payer, data)


@router.delete("/{payer_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_payer(
    payer_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    owner_id: uuid.UUID = Depends(get_current_user_id),
) -> None:
    payer = await crud.get_payer(session, owner_id, payer_id, incluso_borrado=True)
    if payer is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_NOT_FOUND)
    # Idempotente (1.7.0): lo ya borrado da 204.
    if payer.deleted_at is not None:
        return
    await crud.soft_delete_payer(session, payer)


# El boton del aviso de un pago a confirmar ("Pagada con Efectivo", 0032). Sin
# sesion, como los de los recordatorios: lo autoriza el permiso de un solo uso
# que viajo en el aviso.
router_acciones = APIRouter(prefix="/payment-actions", tags=["payers"])


@router_acciones.post("", status_code=status.HTTP_204_NO_CONTENT)
async def accion_del_aviso(
    data: AccionDelAviso, session: AsyncSession = Depends(get_session)
) -> None:
    if not await aviso_pagos.usar_permiso(session, data.token, data.accion):
        # Sin detalle de por que: no se confirma si un permiso existio.
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Permiso no válido")
