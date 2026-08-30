import uuid
from datetime import date

from sqlalchemy import (
    CHAR,
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    ForeignKey,
    Integer,
    SmallInteger,
    Text,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models._base import IdMixin, TimestampMixin


class RecurringRule(Base, IdMixin, TimestampMixin):
    __tablename__ = "recurring_rules"

    owner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    group_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("groups.id"))
    name: Mapped[str] = mapped_column(Text, nullable=False)
    kind: Mapped[str] = mapped_column(Text, nullable=False)
    account_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("accounts.id"), nullable=False)
    transfer_account_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("accounts.id"))
    category_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("categories.id"))
    payment_method_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("payment_methods.id"))
    amount: Mapped[int] = mapped_column(BigInteger, nullable=False)
    currency: Mapped[str] = mapped_column(CHAR(3), nullable=False)
    payee: Mapped[str | None] = mapped_column(Text)
    notes: Mapped[str | None] = mapped_column(Text)
    frequency: Mapped[str] = mapped_column(Text, nullable=False)
    interval_count: Mapped[int] = mapped_column(
        SmallInteger, nullable=False, server_default=text("1")
    )
    day_of_period: Mapped[int | None] = mapped_column(SmallInteger)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date | None] = mapped_column(Date)
    next_run_date: Mapped[date] = mapped_column(Date, nullable=False)
    auto_create: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))

    __table_args__ = (
        CheckConstraint("kind IN ('expense','income','transfer')", name="rec_kind_chk"),
        CheckConstraint("frequency IN ('daily','weekly','monthly','yearly')", name="rec_freq_chk"),
    )


class Template(Base, IdMixin, TimestampMixin):
    __tablename__ = "templates"

    owner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    kind: Mapped[str] = mapped_column(Text, nullable=False)
    account_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("accounts.id"))
    category_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("categories.id"))
    payment_method_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("payment_methods.id"))
    amount: Mapped[int | None] = mapped_column(BigInteger)
    currency: Mapped[str | None] = mapped_column(CHAR(3))
    payee: Mapped[str | None] = mapped_column(Text)
    notes: Mapped[str | None] = mapped_column(Text)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))

    __table_args__ = (
        CheckConstraint("kind IN ('expense','income','transfer')", name="templates_kind_chk"),
    )
