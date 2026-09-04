import uuid

from sqlalchemy import (
    CHAR,
    BigInteger,
    Boolean,
    CheckConstraint,
    ForeignKey,
    Index,
    Integer,
    SmallInteger,
    Text,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models._base import IdMixin, TimestampMixin


class Account(Base, IdMixin, TimestampMixin):
    __tablename__ = "accounts"

    owner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    group_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("groups.id"))
    name: Mapped[str] = mapped_column(Text, nullable=False)
    type: Mapped[str] = mapped_column(Text, nullable=False)
    currency: Mapped[str] = mapped_column(CHAR(3), nullable=False)
    opening_balance: Mapped[int] = mapped_column(
        BigInteger, nullable=False, server_default=text("0")
    )
    off_budget: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))
    visibility: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'private'"))
    color: Mapped[str | None] = mapped_column(Text)
    icon: Mapped[str | None] = mapped_column(Text)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    archived: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))

    __table_args__ = (
        CheckConstraint(
            "type IN ('cash','bank','credit_card','savings','investment','loan','other')",
            name="accounts_type_chk",
        ),
        CheckConstraint("visibility IN ('private','shared')", name="accounts_visibility_chk"),
    )


class PaymentMethod(Base, IdMixin, TimestampMixin):
    __tablename__ = "payment_methods"

    owner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    kind: Mapped[str] = mapped_column(Text, nullable=False)
    last4: Mapped[str | None] = mapped_column(Text)
    brand: Mapped[str | None] = mapped_column(Text)
    closing_day: Mapped[int | None] = mapped_column(SmallInteger)
    due_day: Mapped[int | None] = mapped_column(SmallInteger)
    default_account_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("accounts.id"))
    # Orden elegido por la persona (mismo criterio que accounts.sort_order): lo
    # usa la interfaz para listar y para elegir los primeros en el resumen.
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    archived: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))

    __table_args__ = (
        CheckConstraint(
            "kind IN ('debit_card','credit_card','cash','transfer','wallet','other')",
            name="payment_methods_kind_chk",
        ),
        CheckConstraint(
            "closing_day IS NULL OR closing_day BETWEEN 1 AND 31",
            name="payment_methods_closing_chk",
        ),
        CheckConstraint(
            "due_day IS NULL OR due_day BETWEEN 1 AND 31",
            name="payment_methods_due_chk",
        ),
    )


class PaymentMethodAccount(Base, IdMixin, TimestampMixin):
    __tablename__ = "payment_method_accounts"

    payment_method_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("payment_methods.id"), nullable=False
    )
    account_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("accounts.id"), nullable=False)
    currency: Mapped[str] = mapped_column(CHAR(3), nullable=False)

    # Unico parcial: una cuenta por (medio, moneda) entre las NO borradas.
    # Plano bloquearia re-asociar una moneda cuya asociacion fue borrada (0003).
    __table_args__ = (
        Index(
            "pma_uniq",
            "payment_method_id",
            "currency",
            unique=True,
            postgresql_where=text("deleted_at IS NULL"),
        ),
    )
