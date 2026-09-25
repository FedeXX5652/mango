import uuid
from datetime import datetime

from sqlalchemy import (
    CHAR,
    TIMESTAMP,
    CheckConstraint,
    ForeignKey,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models._base import IdMixin, TimestampMixin


class User(Base, IdMixin, TimestampMixin):
    __tablename__ = "users"

    # `username` reemplaza a `email` como identidad de login (fase 3a). Renombre
    # por expandir/contraer (0012): se agrega y se rellena desde `email`, que
    # queda opcional hasta el release que lo borre. El login usa `username`.
    username: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    email: Mapped[str | None] = mapped_column(Text, unique=True)
    password_hash: Mapped[str] = mapped_column(Text, nullable=False)
    # true = clave temporal puesta por el admin; el cliente obliga a cambiarla
    # antes de hacer nada (reset sin mail, ver ESPECIFICACION §7).
    must_change_password: Mapped[bool] = mapped_column(nullable=False, server_default=text("false"))
    display_name: Mapped[str] = mapped_column(Text, nullable=False)
    base_currency: Mapped[str] = mapped_column(
        CHAR(3), nullable=False, server_default=text("'ARS'")
    )

    # Apariencia. Ver docs/DESIGN.md seccion 5.
    # theme_id: tema predefinido; 'default' siempre existe y es el fallback.
    theme_id: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'default'"))
    # color_scheme: 'system' sigue la preferencia del sistema operativo.
    color_scheme: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'system'"))

    # Monedas que el usuario maneja A MANO: quedan fuera del refresco
    # automatico de cotizaciones (ver 0005). En Argentina es el caso normal
    # para el dolar, donde la cotizacion oficial que publica la API no es la
    # que uno paga. Lista de codigos ISO; vacia o NULL = todas automaticas.
    fx_manual: Mapped[list[str] | None] = mapped_column(JSONB)

    __table_args__ = (
        CheckConstraint("color_scheme IN ('light','dark','system')", name="users_color_scheme_chk"),
    )


class Group(Base, IdMixin, TimestampMixin):
    __tablename__ = "groups"

    name: Mapped[str] = mapped_column(Text, nullable=False)
    base_currency: Mapped[str] = mapped_column(
        CHAR(3), nullable=False, server_default=text("'ARS'")
    )
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)


class GroupMember(Base, IdMixin):
    __tablename__ = "group_members"

    group_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("groups.id"), nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    role: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'member'"))
    joined_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False, server_default=text("now()")
    )
    updated_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True),
        nullable=False,
        server_default=text("now()"),
        onupdate=text("now()"),
    )
    deleted_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True))

    __table_args__ = (
        CheckConstraint("role IN ('owner','member')", name="group_members_role_chk"),
        UniqueConstraint("group_id", "user_id", name="group_members_uniq"),
    )
