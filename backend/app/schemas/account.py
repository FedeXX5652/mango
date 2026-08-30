import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, StringConstraints

AccountType = Literal["cash", "bank", "credit_card", "savings", "investment", "loan", "other"]
Visibility = Literal["private", "shared"]
Currency = Annotated[str, StringConstraints(to_upper=True, min_length=3, max_length=3)]


class AccountBase(BaseModel):
    name: str
    type: AccountType
    currency: Currency
    # Saldo inicial en centavos (entero). Puede ser negativo (ej: deuda de tarjeta).
    opening_balance: int = 0
    off_budget: bool = False
    visibility: Visibility = "private"
    color: str | None = None
    icon: str | None = None
    sort_order: int = 0


class AccountCreate(AccountBase):
    # El id lo genera el cliente (decision 5.1): permite crear sin conexion.
    id: uuid.UUID


class AccountUpdate(BaseModel):
    name: str | None = None
    type: AccountType | None = None
    currency: Currency | None = None
    opening_balance: int | None = None
    off_budget: bool | None = None
    visibility: Visibility | None = None
    color: str | None = None
    icon: str | None = None
    sort_order: int | None = None
    archived: bool | None = None


class AccountRead(AccountBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    archived: bool
    created_at: datetime
    updated_at: datetime
