import uuid
from datetime import datetime

from sqlalchemy import TIMESTAMP, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column


class IdMixin:
    """UUID como PK. Sin default de servidor: el id lo genera el cliente
    (decision fundacional 5.1). Para lo que crea el servidor, lo genera la app."""

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)


class TimestampMixin:
    """created_at / updated_at / deleted_at.

    updated_at y deleted_at no son opcionales: sostienen la sincronizacion.
    El borrado es logico (deleted_at), nunca fisico."""

    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False, server_default=text("now()")
    )
    updated_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True),
        nullable=False,
        server_default=text("now()"),
        onupdate=text("now()"),
    )
    deleted_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True))
