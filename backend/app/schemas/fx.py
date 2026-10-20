"""Cotizaciones entre monedas (ver decision 0005).

`rate` es **cuantas unidades de `quote_currency` compra 1 de `base_currency`**:
el dolar oficial se guarda `base='USD'`, `quote='ARS'`, `rate=1735.10`.

Va como `Decimal`, nunca `float`: una cotizacion multiplica montos y el error de
punto flotante se propaga a plata. En JSON viaja como string, que es como
serializa Pydantic los `Decimal`.
"""

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.account import Currency

# La cotizacion es positiva y no cero: un cero anularia cualquier monto que
# multiplique. El tope de 10 decimales es el de la columna NUMERIC(20,10).
Rate = Decimal

# Los dolares argentinos que se ofrecen (P4, ver 0031).
Casa = Literal["oficial", "mep", "blue", "tarjeta"]


class ExchangeRateCreate(BaseModel):
    # El id lo genera el cliente (decision 5.1): la carga puede hacerse sin
    # conexion y subir despues, como cualquier otra escritura.
    id: uuid.UUID
    base_currency: Currency
    quote_currency: Currency
    rate: Rate = Field(gt=0, max_digits=20, decimal_places=10)
    rate_date: date
    # El origen. Lo que crea el cliente es cargado a mano: 'manual' (antes de la
    # 1.7.0 se elegia una etiqueta, 'oficial', 'mep', 'tarjeta', y se sigue
    # aceptando). 'auto' es del servidor y el CRUD la rechaza (0031).
    source: str = "manual"
    # Que dolar, si el que la carga lo dice. Informativo en una cargada a mano.
    casa: Casa | None = None


class ExchangeRateUpdate(BaseModel):
    # Solo el valor se corrige. Cambiar el par o la fecha es otra cotizacion:
    # se borra esta y se carga la que va.
    rate: Rate | None = Field(default=None, gt=0, max_digits=20, decimal_places=10)
    source: str | None = None


class ExchangeRateRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    base_currency: str
    quote_currency: str
    rate: Decimal
    rate_date: date
    source: str
    casa: str | None
    created_at: datetime
    updated_at: datetime


class RefrescoRead(BaseModel):
    """Que hizo el refresco automatico. La pantalla lo usa para decir algo
    concreto ("USD actualizado", "EUR lo maneja usted a mano")."""

    actualizadas: list[str]
    sin_cambios: list[str]
    manuales: list[str]
    fallidas: list[str]
