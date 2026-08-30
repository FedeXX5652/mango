import uuid
from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.account import Currency

TransactionKind = Literal["expense", "income", "transfer"]
Visibility = Literal["private", "shared"]


class TransactionCreate(BaseModel):
    # El id lo genera el cliente (decision 5.1).
    id: uuid.UUID
    kind: TransactionKind
    occurred_at: datetime
    # Monto: magnitud positiva en centavos. La direccion la da `kind` (ver 0001).
    amount: int = Field(ge=0)
    currency: Currency
    account_id: uuid.UUID
    transfer_account_id: uuid.UUID | None = None
    payment_method_id: uuid.UUID | None = None
    category_id: uuid.UUID | None = None
    payee: str | None = None
    notes: str | None = None
    visibility: Visibility = "private"


class TransactionUpdate(BaseModel):
    kind: TransactionKind | None = None
    occurred_at: datetime | None = None
    amount: int | None = Field(default=None, ge=0)
    currency: Currency | None = None
    account_id: uuid.UUID | None = None
    transfer_account_id: uuid.UUID | None = None
    payment_method_id: uuid.UUID | None = None
    category_id: uuid.UUID | None = None
    payee: str | None = None
    notes: str | None = None
    visibility: Visibility | None = None


class TransactionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    kind: TransactionKind
    status: str
    occurred_at: datetime
    account_id: uuid.UUID | None
    transfer_account_id: uuid.UUID | None
    payment_method_id: uuid.UUID | None
    category_id: uuid.UUID | None
    amount: int
    currency: str
    amount_account: int | None
    exchange_rate: Decimal | None
    payee: str | None
    notes: str | None
    source: str
    visibility: str
    created_at: datetime
    updated_at: datetime
