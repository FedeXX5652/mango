"""Rutas del calendario de pagos (1.5.0, ver 0030): el buzon de escritura de
`reminders` y `reminder_cycles` (la sync las sube por aca; la lectura es local)."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user_id
from app.core.errors import DomainError
from app.crud import reminder as crud
from app.db import get_session
from app.schemas.reminder import (
    AccionDelAviso,
    ReminderCreate,
    ReminderCycleCreate,
    ReminderCycleRead,
    ReminderCycleUpdate,
    ReminderRead,
    ReminderUpdate,
)
from app.services import aviso_recordatorios

router = APIRouter(prefix="/reminders", tags=["reminders"])
router_ciclos = APIRouter(prefix="/reminder-cycles", tags=["reminders"])

_NO_ESTA = "Recordatorio no encontrado"
_CICLO_NO_ESTA = "Vencimiento no encontrado"


def _422(exc: DomainError) -> HTTPException:
    return HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc))


@router.post("", response_model=ReminderRead, status_code=status.HTTP_201_CREATED)
async def crear(
    data: ReminderCreate,
    session: AsyncSession = Depends(get_session),
    user_id: uuid.UUID = Depends(get_current_user_id),
) -> ReminderRead:
    try:
        return await crud.create_reminder(session, user_id, data)
    except DomainError as exc:
        raise _422(exc) from exc


@router.patch("/{reminder_id}", response_model=ReminderRead)
async def modificar(
    reminder_id: uuid.UUID,
    data: ReminderUpdate,
    session: AsyncSession = Depends(get_session),
    user_id: uuid.UUID = Depends(get_current_user_id),
) -> ReminderRead:
    reminder = await crud.get_reminder(session, user_id, reminder_id)
    if reminder is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_NO_ESTA)
    try:
        return await crud.update_reminder(session, reminder, data)
    except DomainError as exc:
        raise _422(exc) from exc


@router.delete("/{reminder_id}", status_code=status.HTTP_204_NO_CONTENT)
async def borrar(
    reminder_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user_id: uuid.UUID = Depends(get_current_user_id),
) -> None:
    # Idempotente: borrarlo desde dos dispositivos sin conexion (o un reintento de
    # la sync) llega dos veces. El segundo no es un error: un 404 iria a
    # "Rechazados" por algo que ya se hizo.
    reminder = await crud.get_reminder(session, user_id, reminder_id, incluso_borrado=True)
    if reminder is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_NO_ESTA)
    if reminder.deleted_at is None:
        await crud.soft_delete_reminder(session, reminder)


# El POST es alta o actualizacion: el id del ciclo es determinista y dos
# dispositivos pueden mandar el mismo (ver crud.guardar_ciclo).
@router_ciclos.post("", response_model=ReminderCycleRead, status_code=status.HTTP_201_CREATED)
async def guardar_ciclo(
    data: ReminderCycleCreate,
    session: AsyncSession = Depends(get_session),
    user_id: uuid.UUID = Depends(get_current_user_id),
) -> ReminderCycleRead:
    try:
        ciclo = await crud.guardar_ciclo(session, user_id, data)
    except DomainError as exc:
        raise _422(exc) from exc
    if ciclo is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_NO_ESTA)
    return ciclo


@router_ciclos.patch("/{ciclo_id}", response_model=ReminderCycleRead)
async def modificar_ciclo(
    ciclo_id: uuid.UUID,
    data: ReminderCycleUpdate,
    session: AsyncSession = Depends(get_session),
    user_id: uuid.UUID = Depends(get_current_user_id),
) -> ReminderCycleRead:
    ciclo = await crud.get_ciclo(session, user_id, ciclo_id)
    if ciclo is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_CICLO_NO_ESTA)
    try:
        return await crud.update_ciclo(session, user_id, ciclo, data)
    except DomainError as exc:
        raise _422(exc) from exc


# Los botones del aviso push ("Ya lo pagué", "Más tarde"; 0030, C5). Sin sesion:
# el service worker no la tiene. Lo autoriza el permiso de un solo uso que viajo
# en el aviso. Se justifica como endpoint porque no hay otro camino: sin la app
# abierta no hay sincronizacion que suba la respuesta.
router_acciones = APIRouter(prefix="/reminder-actions", tags=["reminders"])


@router_acciones.post("", status_code=status.HTTP_204_NO_CONTENT)
async def accion_del_aviso(
    data: AccionDelAviso, session: AsyncSession = Depends(get_session)
) -> None:
    if not await aviso_recordatorios.usar_permiso(session, data.token, data.accion):
        # Sin detalle de por que: no se confirma si un permiso existio.
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Permiso no válido")
