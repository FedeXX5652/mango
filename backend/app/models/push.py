"""Suscripciones de push de cada dispositivo (1.4.0, Web Push).

Es estado del SERVIDOR: no se sincroniza. Cada navegador que acepta avisos deja
su `endpoint` (la direccion del servicio de push de ese navegador) y las claves
para cifrarle los mensajes. Un mismo endpoint es un solo dispositivo: si otra
persona inicia sesion ahi, la suscripcion pasa a ser suya.
"""

import uuid

from sqlalchemy import ForeignKey, Index, Text, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models._base import IdMixin, TimestampMixin


class PushSubscription(Base, IdMixin, TimestampMixin):
    __tablename__ = "push_subscriptions"

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    endpoint: Mapped[str] = mapped_column(Text, nullable=False)
    p256dh: Mapped[str] = mapped_column(Text, nullable=False)
    auth: Mapped[str] = mapped_column(Text, nullable=False)
    # Para reconocerlo en una lista ("Chrome en Android"). Opcional.
    dispositivo: Mapped[str | None] = mapped_column(Text)
    # Que tipos de aviso acepta este dispositivo ("grupos", "recordatorios").
    # NULL = todos.
    tipos: Mapped[list[str] | None] = mapped_column(JSONB(none_as_null=True))

    __table_args__ = (
        # Un endpoint vigente es un dispositivo.
        Index(
            "push_subscriptions_endpoint_uniq",
            "endpoint",
            unique=True,
            postgresql_where=text("deleted_at IS NULL"),
        ),
    )
