"""Adjuntos: fotos de tickets de un movimiento (fase 5).

El binario vive en disco (`attachments_dir`), NO en la base ni en la sync: solo
la metadata (nombre, tipo, tamaño) sincroniza. Es la forma sana de manejar
archivos con local-first: la cola de sync mueve filas chicas, no imagenes.
"""

import uuid
from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.errors import DomainError
from app.models.transaction import Attachment, Transaction

# Lo que aceptamos: fotos de tickets y PDFs. Nada ejecutable.
TIPOS_OK = {"image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"}
_EXT = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/heic": ".heic",
    "application/pdf": ".pdf",
}


def _dir() -> Path:
    d = Path(settings.attachments_dir)
    d.mkdir(parents=True, exist_ok=True)
    return d


async def _tx_propia(session: AsyncSession, owner_id: uuid.UUID, tx_id: uuid.UUID) -> bool:
    stmt = select(Transaction.id).where(
        Transaction.id == tx_id,
        Transaction.owner_id == owner_id,
        Transaction.deleted_at.is_(None),
    )
    return (await session.execute(stmt)).scalar_one_or_none() is not None


async def guardar(
    session: AsyncSession,
    owner_id: uuid.UUID,
    tx_id: uuid.UUID,
    *,
    filename: str,
    mime_type: str,
    contenido: bytes,
) -> Attachment:
    if not await _tx_propia(session, owner_id, tx_id):
        raise DomainError("El movimiento no existe")
    if mime_type not in TIPOS_OK:
        raise DomainError("Tipo de archivo no permitido (foto o PDF)")
    if len(contenido) == 0:
        raise DomainError("El archivo está vacío")
    if len(contenido) > settings.attachments_max_bytes:
        raise DomainError("El archivo es demasiado grande")

    att_id = uuid.uuid4()
    ruta = _dir() / f"{att_id}{_EXT.get(mime_type, '')}"
    ruta.write_bytes(contenido)

    att = Attachment(
        id=att_id,
        transaction_id=tx_id,
        owner_id=owner_id,
        filename=filename,
        mime_type=mime_type,
        size_bytes=len(contenido),
        storage_path=str(ruta),
    )
    session.add(att)
    await session.commit()
    await session.refresh(att)
    return att


async def get_attachment(
    session: AsyncSession, owner_id: uuid.UUID, att_id: uuid.UUID
) -> Attachment | None:
    stmt = select(Attachment).where(
        Attachment.id == att_id,
        Attachment.owner_id == owner_id,
        Attachment.deleted_at.is_(None),
    )
    return (await session.execute(stmt)).scalar_one_or_none()


async def soft_delete_attachment(session: AsyncSession, att: Attachment) -> None:
    # Borrado logico de la fila; el binario en disco se deja (barato, y permite
    # una limpieza posterior sin perder trazabilidad).
    att.deleted_at = func.now()
    await session.commit()
