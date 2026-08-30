import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.account import Currency

PaymentMethodKind = Literal["debit_card", "credit_card", "cash", "transfer", "wallet", "other"]


class PaymentMethodCreate(BaseModel):
    id: uuid.UUID
    name: str
    kind: PaymentMethodKind
    # Ultimos 4 digitos: es lo que traen las alertas de Visa.
    last4: str | None = None
    brand: str | None = None
    # Para tarjetas de credito: dia de cierre y de vencimiento (1..31).
    closing_day: int | None = Field(default=None, ge=1, le=31)
    due_day: int | None = Field(default=None, ge=1, le=31)
    # Cuenta que se debita si no hay match por moneda.
    default_account_id: uuid.UUID | None = None


class PaymentMethodUpdate(BaseModel):
    name: str | None = None
    last4: str | None = None
    brand: str | None = None
    closing_day: int | None = Field(default=None, ge=1, le=31)
    due_day: int | None = Field(default=None, ge=1, le=31)
    default_account_id: uuid.UUID | None = None
    archived: bool | None = None


class PaymentMethodRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    kind: PaymentMethodKind
    last4: str | None
    brand: str | None
    closing_day: int | None
    due_day: int | None
    default_account_id: uuid.UUID | None
    archived: bool
    created_at: datetime
    updated_at: datetime


class PaymentMethodAccountCreate(BaseModel):
    # (medio, moneda) -> cuenta que se debita. El id lo genera el cliente.
    id: uuid.UUID
    currency: Currency
    account_id: uuid.UUID


class PaymentMethodAccountRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    payment_method_id: uuid.UUID
    account_id: uuid.UUID
    currency: str
    created_at: datetime
    updated_at: datetime
