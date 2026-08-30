from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    CHAR,
    TIMESTAMP,
    Date,
    Numeric,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models._base import IdMixin


class ExchangeRate(Base, IdMixin):
    """Solo lleva created_at: una cotizacion es un hecho inmutable, no se
    edita ni se borra logicamente. Por eso no usa TimestampMixin."""

    __tablename__ = "exchange_rates"

    base_currency: Mapped[str] = mapped_column(CHAR(3), nullable=False)
    quote_currency: Mapped[str] = mapped_column(CHAR(3), nullable=False)
    rate: Mapped[Decimal] = mapped_column(Numeric(20, 10), nullable=False)
    rate_date: Mapped[date] = mapped_column(Date, nullable=False)
    source: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'manual'"))
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False, server_default=text("now()")
    )

    __table_args__ = (
        UniqueConstraint("base_currency", "quote_currency", "rate_date", "source", name="fx_uniq"),
    )
