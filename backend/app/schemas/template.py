import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.account import Currency

TxKind = Literal["expense", "income", "transfer"]


class TemplateCreate(BaseModel):
    id: uuid.UUID
    name: str
    kind: TxKind
    # Campos que definen la transaccion, todos opcionales: una plantilla puede
    # estar parcial y completarse al aplicarla.
    account_id: uuid.UUID | None = None
    category_id: uuid.UUID | None = None
    payment_method_id: uuid.UUID | None = None
    amount: int | None = Field(default=None, ge=0)
    currency: Currency | None = None
    payee: str | None = None
    notes: str | None = None
    sort_order: int = 0


class TemplateUpdate(BaseModel):
    name: str | None = None
    account_id: uuid.UUID | None = None
    category_id: uuid.UUID | None = None
    payment_method_id: uuid.UUID | None = None
    amount: int | None = Field(default=None, ge=0)
    currency: Currency | None = None
    payee: str | None = None
    notes: str | None = None
    sort_order: int | None = None


class TemplateRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    kind: TxKind
    account_id: uuid.UUID | None
    category_id: uuid.UUID | None
    payment_method_id: uuid.UUID | None
    amount: int | None
    currency: str | None
    payee: str | None
    notes: str | None
    sort_order: int
    created_at: datetime
    updated_at: datetime


class TemplateApply(BaseModel):
    """Datos para materializar la plantilla en una transaccion (de un toque).
    El id de la nueva transaccion lo genera el cliente (decision 5.1)."""

    id: uuid.UUID
    occurred_at: datetime
    # Overrides opcionales sobre lo que trae la plantilla.
    amount: int | None = Field(default=None, ge=0)
    account_id: uuid.UUID | None = None
    transfer_account_id: uuid.UUID | None = None
    category_id: uuid.UUID | None = None
    payment_method_id: uuid.UUID | None = None
    currency: Currency | None = None
    payee: str | None = None
    notes: str | None = None
