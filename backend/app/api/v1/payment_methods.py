"""Rutas de medios de pago y sus asociaciones por moneda."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user_id
from app.core.errors import DomainError
from app.crud import payment_method as crud
from app.db import get_session
from app.schemas.payment_method import (
    PaymentMethodAccountCreate,
    PaymentMethodAccountRead,
    PaymentMethodCreate,
    PaymentMethodRead,
    PaymentMethodUpdate,
)

router = APIRouter(prefix="/payment-methods", tags=["payment-methods"])
# La asociacion (medio, moneda) -> cuenta, por su id: lo que borra la sync (1.7.0).
router_pma = APIRouter(prefix="/payment-method-accounts", tags=["payment-methods"])

_NOT_FOUND = "Medio de pago no encontrado"


def _domain_422(exc: DomainError) -> HTTPException:
    return HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc))


# --- Medios de pago ---------------------------------------------------------


@router.post("", response_model=PaymentMethodRead, status_code=status.HTTP_201_CREATED)
async def create_payment_method(
    data: PaymentMethodCreate,
    session: AsyncSession = Depends(get_session),
    owner_id: uuid.UUID = Depends(get_current_user_id),
) -> PaymentMethodRead:
    try:
        return await crud.create_payment_method(session, owner_id, data)
    except DomainError as exc:
        raise _domain_422(exc) from exc


@router.patch("/{pm_id}", response_model=PaymentMethodRead)
async def update_payment_method(
    pm_id: uuid.UUID,
    data: PaymentMethodUpdate,
    session: AsyncSession = Depends(get_session),
    owner_id: uuid.UUID = Depends(get_current_user_id),
) -> PaymentMethodRead:
    pm = await crud.get_payment_method(session, owner_id, pm_id)
    if pm is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_NOT_FOUND)
    try:
        return await crud.update_payment_method(session, owner_id, pm, data)
    except DomainError as exc:
        raise _domain_422(exc) from exc


@router.delete("/{pm_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_payment_method(
    pm_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    owner_id: uuid.UUID = Depends(get_current_user_id),
) -> None:
    pm = await crud.get_payment_method(session, owner_id, pm_id, incluso_borrado=True)
    if pm is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_NOT_FOUND)
    # Idempotente (1.7.0): lo ya borrado da 204, no un 404 que iria a
    # "Rechazados". Lo ajeno sigue en 404.
    if pm.deleted_at is not None:
        return
    await crud.soft_delete_payment_method(session, pm)


# --- Asociacion (medio, moneda) -> cuenta -----------------------------------


async def _require_pm(session: AsyncSession, owner_id: uuid.UUID, pm_id: uuid.UUID) -> None:
    if await crud.get_payment_method(session, owner_id, pm_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_NOT_FOUND)


@router.post(
    "/{pm_id}/accounts",
    response_model=PaymentMethodAccountRead,
    status_code=status.HTTP_201_CREATED,
)
async def add_account_mapping(
    pm_id: uuid.UUID,
    data: PaymentMethodAccountCreate,
    session: AsyncSession = Depends(get_session),
    owner_id: uuid.UUID = Depends(get_current_user_id),
) -> PaymentMethodAccountRead:
    pm = await crud.get_payment_method(session, owner_id, pm_id)
    if pm is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_NOT_FOUND)
    try:
        return await crud.create_pma(session, owner_id, pm, data)
    except DomainError as exc:
        raise _domain_422(exc) from exc


@router.delete("/{pm_id}/accounts/{pma_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_account_mapping(
    pm_id: uuid.UUID,
    pma_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    owner_id: uuid.UUID = Depends(get_current_user_id),
) -> None:
    await _require_pm(session, owner_id, pm_id)
    pma = await crud.get_pma(session, pm_id, pma_id)
    if pma is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Asociacion no encontrada"
        )
    await crud.soft_delete_pma(session, pma)


@router_pma.delete("/{pma_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_pma(
    pma_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    owner_id: uuid.UUID = Depends(get_current_user_id),
) -> None:
    """Borrar una asociacion desde la cola de subida. La cola no trae el medio
    (solo el id), asi que no sirve la ruta anidada. Idempotente: lo ya borrado da
    204; lo ajeno, 404."""
    pma = await crud.get_pma_mia(session, owner_id, pma_id, incluso_borrado=True)
    if pma is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Asociacion no encontrada"
        )
    if pma.deleted_at is None:
        await crud.soft_delete_pma(session, pma)
