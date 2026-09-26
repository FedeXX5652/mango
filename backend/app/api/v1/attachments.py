"""Rutas de adjuntos (fase 5). El binario se sube y se sirve por aca (no por la
sync); la metadata baja por el stream `mio`."""

import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user_id
from app.core.errors import DomainError
from app.crud import attachment as crud
from app.db import get_session
from app.schemas.attachment import AttachmentRead

router = APIRouter(tags=["attachments"])


@router.post(
    "/transactions/{tx_id}/attachments",
    response_model=AttachmentRead,
    status_code=status.HTTP_201_CREATED,
)
async def subir_adjunto(
    tx_id: uuid.UUID,
    file: UploadFile = File(...),
    session: AsyncSession = Depends(get_session),
    owner_id: uuid.UUID = Depends(get_current_user_id),
) -> AttachmentRead:
    contenido = await file.read()
    try:
        return await crud.guardar(
            session,
            owner_id,
            tx_id,
            filename=file.filename or "adjunto",
            mime_type=file.content_type or "application/octet-stream",
            contenido=contenido,
        )
    except DomainError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)
        ) from exc


@router.get("/attachments/{att_id}/file")
async def ver_adjunto(
    att_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    owner_id: uuid.UUID = Depends(get_current_user_id),
) -> FileResponse:
    att = await crud.get_attachment(session, owner_id, att_id)
    if att is None or not Path(att.storage_path).exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Adjunto no encontrado")
    return FileResponse(att.storage_path, media_type=att.mime_type, filename=att.filename)


@router.delete("/attachments/{att_id}", status_code=status.HTTP_204_NO_CONTENT)
async def borrar_adjunto(
    att_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    owner_id: uuid.UUID = Depends(get_current_user_id),
) -> None:
    att = await crud.get_attachment(session, owner_id, att_id)
    if att is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Adjunto no encontrado")
    await crud.soft_delete_attachment(session, att)
