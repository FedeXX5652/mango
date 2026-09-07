from datetime import date
from decimal import Decimal

from sqlalchemy import (
    CHAR,
    Date,
    Index,
    Numeric,
    Text,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models._base import IdMixin, TimestampMixin


class ExchangeRate(Base, IdMixin, TimestampMixin):
    """Cotizacion de una moneda contra otra en una fecha, segun una fuente.

    `rate` es cuantas unidades de `quote_currency` compra 1 de `base_currency`:
    el dolar oficial se guarda base='USD', quote='ARS', rate=1735.10 (ver 0005).

    Una cotizacion es un hecho, pero un hecho que se puede haber cargado mal:
    lleva `updated_at` para poder corregirla y `deleted_at` porque nada se borra
    fisicamente (regla 3). El unico es parcial por eso mismo (ver 0003)."""

    __tablename__ = "exchange_rates"

    base_currency: Mapped[str] = mapped_column(CHAR(3), nullable=False)
    quote_currency: Mapped[str] = mapped_column(CHAR(3), nullable=False)
    rate: Mapped[Decimal] = mapped_column(Numeric(20, 10), nullable=False)
    rate_date: Mapped[date] = mapped_column(Date, nullable=False)
    source: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'manual'"))

    __table_args__ = (
        # Una cotizacion por (par, fecha, fuente) entre las vigentes. Parcial
        # para que borrar y volver a cargar no choque (decision 0003).
        Index(
            "fx_uniq",
            "base_currency",
            "quote_currency",
            "rate_date",
            "source",
            unique=True,
            postgresql_where=text("deleted_at IS NULL"),
        ),
        # La consulta caliente es "la ultima cotizacion conocida de este par".
        Index("fx_par_fecha", "base_currency", "quote_currency", "rate_date"),
    )
