import uuid
from datetime import datetime

from sqlalchemy import (
    CHAR,
    TIMESTAMP,
    BigInteger,
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
    # Color del grupo, para distinguir su origen en toda la app (chip de grupo,
    # ver 3b.2c). Opcional: sin color se cae a un neutro en el cliente.
    color: Mapped[str | None] = mapped_column(Text)
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


class Settlement(Base, IdMixin, TimestampMixin):
    """Un pago entre miembros para saldar deudas del grupo (fase 3b.3, ver 0015).

    `from_user_id` le paga `amount` a `to_user_id`. No mueve plata de ninguna
    cuenta de la app: es el registro de que la deuda se salda por fuera (efectivo,
    transferencia). Ajusta el balance del grupo, no los saldos personales."""

    __tablename__ = "settlements"

    group_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("groups.id"), nullable=False)
    from_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    to_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    amount: Mapped[int] = mapped_column(BigInteger, nullable=False)
    currency: Mapped[str] = mapped_column(CHAR(3), nullable=False)
    occurred_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), nullable=False)
    note: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    # Pago REAL: si vienen, la plata salio de esta cuenta/medio del que paga
    # (from_user_id) y se descuenta de su saldo. Si van NULL, es "marcar saldado":
    # se salda por fuera, no mueve plata (ver 0017). account_id/payment_method_id
    # son del pagador y NO viajan a los otros miembros (privacidad, como en tx).
    account_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("accounts.id"))
    payment_method_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("payment_methods.id"))

    __table_args__ = (
        CheckConstraint("amount > 0", name="settlements_amount_chk"),
        CheckConstraint("from_user_id <> to_user_id", name="settlements_distintos_chk"),
    )


class Notification(Base, IdMixin, TimestampMixin):
    """Aviso in-app para un usuario (fase 3b, ver 0019). Lo crea el SERVIDOR en
    eventos (te llego un pago, se deshizo un pago, te sumaron a un grupo). El
    cliente solo lo marca leido (`read_at`); no crea ni borra avisos."""

    __tablename__ = "notifications"

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    type: Mapped[str] = mapped_column(Text, nullable=False)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    # Ruta a abrir al tocar el aviso (ej: '/', '/grupos/<id>'). Opcional.
    link: Mapped[str | None] = mapped_column(Text)
    read_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True))
