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

    # Personal (owner_id) o del grupo / conjunta (group_id), como categorias
    # (ver 0014/0016). Una cuenta conjunta tiene owner_id NULL y group_id.
    owner_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
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

    # Tarjeta de credito (0034): sus datos viven en la cuenta, no en un medio de
    # pago. Solo en una `credit_card` principal; en cualquier otra, NULL.
    brand: Mapped[str | None] = mapped_column(Text)
    last4: Mapped[str | None] = mapped_column(Text)
    closing_day: Mapped[int | None] = mapped_column(SmallInteger)
    due_day: Mapped[int | None] = mapped_column(SmallInteger)
    # Limite de compra, en centavos de la moneda de la cuenta. Informativo.
    credit_limit: Mapped[int | None] = mapped_column(BigInteger)
    # El saldo en otra moneda de la misma tarjeta (dolares) es otra cuenta que
    # apunta a la principal: cada cuenta sigue teniendo una sola moneda (0005).
    parent_account_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("accounts.id"))

    __table_args__ = (
        CheckConstraint(
            "type IN ('cash','bank','credit_card','savings','investment','loan','other')",
            name="accounts_type_chk",
        ),
        CheckConstraint("visibility IN ('private','shared')", name="accounts_visibility_chk"),
        # Los datos de tarjeta, solo en una tarjeta.
        CheckConstraint(
            "type = 'credit_card' OR (brand IS NULL AND last4 IS NULL AND closing_day IS NULL"
            " AND due_day IS NULL AND credit_limit IS NULL AND parent_account_id IS NULL)",
            name="accounts_tarjeta_chk",
        ),
        # Un saldo secundario hereda los datos de su tarjeta: no tiene propios.
        CheckConstraint(
            "parent_account_id IS NULL OR (brand IS NULL AND last4 IS NULL"
            " AND closing_day IS NULL AND due_day IS NULL AND credit_limit IS NULL)",
            name="accounts_saldo_secundario_chk",
        ),
        CheckConstraint(
            "parent_account_id IS NULL OR parent_account_id <> id", name="accounts_parent_chk"
        ),
        CheckConstraint(
            "closing_day IS NULL OR closing_day BETWEEN 1 AND 31", name="accounts_closing_chk"
        ),
        CheckConstraint("due_day IS NULL OR due_day BETWEEN 1 AND 31", name="accounts_due_chk"),
        CheckConstraint("last4 IS NULL OR last4 ~ '^[0-9]{4}$'", name="accounts_last4_chk"),
        CheckConstraint("credit_limit IS NULL OR credit_limit >= 0", name="accounts_limit_chk"),
        # Un saldo por moneda en cada tarjeta, entre los no borrados.
        Index(
            "accounts_saldo_moneda_uniq",
            "parent_account_id",
            "currency",
            unique=True,
            postgresql_where=text("parent_account_id IS NOT NULL AND deleted_at IS NULL"),
        ),
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

    # Dueño propio: las reglas de sync no hacen JOIN (ver sync-config.yaml).
    owner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
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
