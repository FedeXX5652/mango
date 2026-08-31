import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    CHAR,
    TIMESTAMP,
    BigInteger,
    CheckConstraint,
    ForeignKey,
    Index,
    Numeric,
    Text,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models._base import IdMixin, TimestampMixin


class Transaction(Base, IdMixin, TimestampMixin):
    __tablename__ = "transactions"

    owner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    group_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("groups.id"))
    visibility: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'private'"))

    kind: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'confirmed'"))

    # Momento real del gasto, con hora (necesaria para deduplicar)
    occurred_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), nullable=False)

    account_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("accounts.id"))
    transfer_account_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("accounts.id"))
    payment_method_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("payment_methods.id"))
    category_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("categories.id"))

    # Monto: magnitud positiva en centavos. La direccion la da `kind` (ver 0001).
    amount: Mapped[int] = mapped_column(BigInteger, nullable=False)
    currency: Mapped[str] = mapped_column(CHAR(3), nullable=False)

    # Conversion a la moneda de la cuenta debitada, cuando difiere
    amount_account: Mapped[int | None] = mapped_column(BigInteger)
    exchange_rate: Mapped[Decimal | None] = mapped_column(Numeric(20, 10))

    payee: Mapped[str | None] = mapped_column(Text)
    notes: Mapped[str | None] = mapped_column(Text)

    source: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'manual'"))
    external_id: Mapped[str | None] = mapped_column(Text)
    raw_payload: Mapped[dict | None] = mapped_column(JSONB)

    pending_reason: Mapped[str | None] = mapped_column(Text)

    suggested_category_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("categories.id"))
    suggestion_source: Mapped[str | None] = mapped_column(Text)

    __table_args__ = (
        CheckConstraint("kind IN ('expense','income','transfer')", name="tx_kind_chk"),
        CheckConstraint("status IN ('confirmed','pending','rejected')", name="tx_status_chk"),
        CheckConstraint("visibility IN ('private','shared')", name="tx_visibility_chk"),
        CheckConstraint(
            "source IN ('manual','email_import','api','recurring','template')",
            name="tx_source_chk",
        ),
        CheckConstraint(
            "suggestion_source IS NULL OR suggestion_source IN ('ai','rule')",
            name="tx_suggestion_chk",
        ),
        # Una sugerencia solo tiene sentido en una transaccion pendiente
        CheckConstraint(
            "suggested_category_id IS NULL OR status = 'pending'", name="tx_suggested_chk"
        ),
        # 'pending' solo lo produce la ingesta automatica, nunca una carga manual
        CheckConstraint("status <> 'pending' OR source <> 'manual'", name="tx_pending_source_chk"),
        # Una transferencia necesita las dos puntas
        CheckConstraint(
            "kind <> 'transfer' OR (account_id IS NOT NULL AND transfer_account_id IS NOT NULL)",
            name="tx_transfer_chk",
        ),
        # Una transaccion confirmada necesita cuenta
        CheckConstraint("status <> 'confirmed' OR account_id IS NOT NULL", name="tx_confirmed_chk"),
        # El monto es magnitud positiva; la direccion la da `kind` (ver 0001)
        CheckConstraint("amount >= 0", name="tx_amount_chk"),
        # Una transferencia mueve plata entre cuentas propias: no se categoriza.
        CheckConstraint(
            "kind <> 'transfer' OR category_id IS NULL", name="tx_transfer_sin_categoria_chk"
        ),
        # Gasto e ingreso necesitan categoria, con dos excepciones: la ingesta
        # puede dejar un 'pending' sin categoria (4.4/4.7), y un 'rejected' (una
        # compra que el banco rechazo) llega como gasto sin categoria y no es real.
        CheckConstraint(
            "kind = 'transfer' OR status IN ('pending', 'rejected') OR category_id IS NOT NULL",
            name="tx_categoria_obligatoria_chk",
        ),
        Index(
            "tx_external_uniq",
            "owner_id",
            "external_id",
            unique=True,
            postgresql_where=text("external_id IS NOT NULL AND deleted_at IS NULL"),
        ),
        Index(
            "tx_owner_date_idx",
            "owner_id",
            text("occurred_at DESC"),
            postgresql_where=text("deleted_at IS NULL"),
        ),
        Index(
            "tx_group_date_idx",
            "group_id",
            text("occurred_at DESC"),
            postgresql_where=text("deleted_at IS NULL"),
        ),
        Index("tx_account_idx", "account_id", postgresql_where=text("deleted_at IS NULL")),
        Index("tx_category_idx", "category_id", postgresql_where=text("deleted_at IS NULL")),
        Index("tx_status_idx", "owner_id", "status", postgresql_where=text("deleted_at IS NULL")),
        Index("tx_sync_idx", "owner_id", "updated_at"),
    )


class TransactionSplit(Base, IdMixin, TimestampMixin):
    __tablename__ = "transaction_splits"

    transaction_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("transactions.id"), nullable=False)
    category_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("categories.id"))
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    amount: Mapped[int] = mapped_column(BigInteger, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)


class Attachment(Base, IdMixin, TimestampMixin):
    __tablename__ = "attachments"

    transaction_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("transactions.id"), nullable=False)
    owner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    filename: Mapped[str] = mapped_column(Text, nullable=False)
    mime_type: Mapped[str] = mapped_column(Text, nullable=False)
    size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    storage_path: Mapped[str] = mapped_column(Text, nullable=False)
