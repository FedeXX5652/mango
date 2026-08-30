"""Rutas de transacciones. Traducen DomainError (reglas por kind) a 422."""

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user_id
from app.core.errors import DomainError
from app.crud import transaction as crud
from app.db import get_session
from app.schemas.transaction import (
    TransactionCreate,
    TransactionKind,
    TransactionRead,
    TransactionUpdate,
)
from app.services.export import transactions_csv

router = APIRouter(prefix="/transactions", tags=["transactions"])

_NOT_FOUND = "Transaccion no encontrada"


def _domain_422(exc: DomainError) -> HTTPException:
    return HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc))


@router.post("", response_model=TransactionRead, status_code=status.HTTP_201_CREATED)
async def create_transaction(
    data: TransactionCreate,
    session: AsyncSession = Depends(get_session),
    owner_id: uuid.UUID = Depends(get_current_user_id),
) -> TransactionRead:
    try:
        return await crud.create_transaction(session, owner_id, data)
    except DomainError as exc:
        raise _domain_422(exc) from exc


@router.get("", response_model=list[TransactionRead])
async def list_transactions(
    account_id: uuid.UUID | None = None,
    category_id: uuid.UUID | None = None,
    kind: TransactionKind | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    session: AsyncSession = Depends(get_session),
    owner_id: uuid.UUID = Depends(get_current_user_id),
) -> list[TransactionRead]:
    return await crud.list_transactions(
        session,
        owner_id,
        account_id=account_id,
        category_id=category_id,
        kind=kind,
        date_from=date_from,
        date_to=date_to,
        limit=limit,
        offset=offset,
    )


@router.get("/export")
async def export_transactions_csv(
    account_id: uuid.UUID | None = None,
    category_id: uuid.UUID | None = None,
    kind: TransactionKind | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    session: AsyncSession = Depends(get_session),
    owner_id: uuid.UUID = Depends(get_current_user_id),
) -> Response:
    # Declarada antes de /{tx_id} para que "export" no se lea como un id.
    csv_text = await transactions_csv(
        session,
        owner_id,
        account_id=account_id,
        category_id=category_id,
        kind=kind,
        date_from=date_from,
        date_to=date_to,
    )
    return Response(
        content=csv_text,
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="mango-transacciones.csv"'},
    )


@router.get("/{tx_id}", response_model=TransactionRead)
async def get_transaction(
    tx_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    owner_id: uuid.UUID = Depends(get_current_user_id),
) -> TransactionRead:
    tx = await crud.get_transaction(session, owner_id, tx_id)
    if tx is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_NOT_FOUND)
    return tx


@router.patch("/{tx_id}", response_model=TransactionRead)
async def update_transaction(
    tx_id: uuid.UUID,
    data: TransactionUpdate,
    session: AsyncSession = Depends(get_session),
    owner_id: uuid.UUID = Depends(get_current_user_id),
) -> TransactionRead:
    tx = await crud.get_transaction(session, owner_id, tx_id)
    if tx is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_NOT_FOUND)
    try:
        return await crud.update_transaction(session, owner_id, tx, data)
    except DomainError as exc:
        raise _domain_422(exc) from exc


@router.delete("/{tx_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_transaction(
    tx_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    owner_id: uuid.UUID = Depends(get_current_user_id),
) -> None:
    tx = await crud.get_transaction(session, owner_id, tx_id)
    if tx is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_NOT_FOUND)
    await crud.soft_delete_transaction(session, tx)
