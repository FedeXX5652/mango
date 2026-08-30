import uuid
from datetime import date

from sqlalchemy import (
    CHAR,
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    ForeignKey,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models._base import IdMixin, TimestampMixin


class Budget(Base, IdMixin, TimestampMixin):
    __tablename__ = "budgets"

    owner_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    group_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("groups.id"))
    category_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("categories.id"), nullable=False)
    period: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'monthly'"))
    period_start: Mapped[date] = mapped_column(Date, nullable=False)
    amount: Mapped[int] = mapped_column(BigInteger, nullable=False)
    currency: Mapped[str] = mapped_column(CHAR(3), nullable=False)
    rollover: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))

    __table_args__ = (
        CheckConstraint("period IN ('weekly','monthly','yearly')", name="budgets_period_chk"),
        UniqueConstraint(
            "owner_id", "group_id", "category_id", "period", "period_start", name="budgets_uniq"
        ),
    )


class Goal(Base, IdMixin, TimestampMixin):
    __tablename__ = "goals"

    owner_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    group_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("groups.id"))
    name: Mapped[str] = mapped_column(Text, nullable=False)
    target_amount: Mapped[int] = mapped_column(BigInteger, nullable=False)
    currency: Mapped[str] = mapped_column(CHAR(3), nullable=False)
    target_date: Mapped[date | None] = mapped_column(Date)
    account_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("accounts.id"))
    archived: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))
