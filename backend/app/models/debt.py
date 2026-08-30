import uuid
from datetime import date, datetime

from sqlalchemy import (
    CHAR,
    TIMESTAMP,
    BigInteger,
    CheckConstraint,
    Date,
    ForeignKey,
    Text,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models._base import IdMixin, TimestampMixin


class Debt(Base, IdMixin, TimestampMixin):
    __tablename__ = "debts"

    owner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    group_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("groups.id"))
    direction: Mapped[str] = mapped_column(Text, nullable=False)
    counterparty: Mapped[str] = mapped_column(Text, nullable=False)
    counterparty_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    description: Mapped[str | None] = mapped_column(Text)
    amount: Mapped[int] = mapped_column(BigInteger, nullable=False)
    currency: Mapped[str] = mapped_column(CHAR(3), nullable=False)
    amount_settled: Mapped[int] = mapped_column(
        BigInteger, nullable=False, server_default=text("0")
    )
    due_date: Mapped[date | None] = mapped_column(Date)
    settled_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True))

    __table_args__ = (
        CheckConstraint("direction IN ('payable','receivable')", name="debts_direction_chk"),
    )
