from datetime import date
from decimal import Decimal

from sqlalchemy import (
    CHAR,
    CheckConstraint,
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

    `source` es el origen: 'auto' la trajo el servidor; cualquier otro valor es
    cargada a mano ('manual', o la etiqueta que se elegia antes de la 1.7.0).
    `casa` es que dolar es una USD -> ARS automatica (0031).

    Una cotizacion es un hecho, pero un hecho que se puede haber cargado mal:
    lleva `updated_at` para poder corregirla y `deleted_at` porque nada se borra
    fisicamente (regla 3). El unico es parcial por eso mismo (ver 0003)."""

    __tablename__ = "exchange_rates"

    base_currency: Mapped[str] = mapped_column(CHAR(3), nullable=False)
    quote_currency: Mapped[str] = mapped_column(CHAR(3), nullable=False)
    rate: Mapped[Decimal] = mapped_column(Numeric(20, 10), nullable=False)
    rate_date: Mapped[date] = mapped_column(Date, nullable=False)
    source: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'manual'"))
    # Que dolar (0031): 'oficial', 'mep', 'blue' o 'tarjeta'. NULL en el resto.
    casa: Mapped[str | None] = mapped_column(Text)

    __table_args__ = (
        # Una cotizacion por (par, fecha, origen, dolar) entre las vigentes.
        # Parcial para que borrar y volver a cargar no choque (decision 0003), y
        # NULLS NOT DISTINCT para que `casa` NULL tambien sea unica.
        Index(
            "fx_uniq",
            "base_currency",
            "quote_currency",
            "rate_date",
            "source",
            "casa",
            unique=True,
            postgresql_where=text("deleted_at IS NULL"),
            postgresql_nulls_not_distinct=True,
        ),
        CheckConstraint(
            "casa IS NULL OR casa IN ('oficial','mep','blue','tarjeta')", name="fx_casa_chk"
        ),
        # La consulta caliente es "la ultima cotizacion conocida de este par".
        Index("fx_par_fecha", "base_currency", "quote_currency", "rate_date"),
    )
