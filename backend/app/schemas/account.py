import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

AccountType = Literal["cash", "bank", "credit_card", "savings", "investment", "loan", "other"]
Visibility = Literal["private", "shared"]
Currency = Annotated[str, StringConstraints(to_upper=True, min_length=3, max_length=3)]

# Datos de una tarjeta de credito (0034). Que solo vayan en una tarjeta lo valida
# el CRUD: depende del tipo y de la tarjeta principal.
Marca = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=30)]
Ultimos4 = Annotated[str, StringConstraints(pattern=r"^[0-9]{4}$")]
DiaDelMes = Annotated[int, Field(ge=1, le=31)]
Limite = Annotated[int, Field(ge=0)]


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
    brand: Marca | None = None
    last4: Ultimos4 | None = None
    closing_day: DiaDelMes | None = None
    due_day: DiaDelMes | None = None
    # Limite de compra en centavos de la moneda de la cuenta. Informativo.
    credit_limit: Limite | None = None
    # El saldo en otra moneda de una tarjeta apunta a la principal (0034).
    parent_account_id: uuid.UUID | None = None


class AccountCreate(AccountBase):
    # El id lo genera el cliente (decision 5.1): permite crear sin conexion.
    id: uuid.UUID
    # Ambito (fase 3b, ver 0016). Si viene, es una cuenta CONJUNTA del grupo:
    # owner_id NULL, la ven todos los miembros. Sin group_id es personal.
    group_id: uuid.UUID | None = None


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
    brand: Marca | None = None
    last4: Ultimos4 | None = None
    closing_day: DiaDelMes | None = None
    due_day: DiaDelMes | None = None
    credit_limit: Limite | None = None
    parent_account_id: uuid.UUID | None = None


class AccountRead(AccountBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    group_id: uuid.UUID | None
    archived: bool
    created_at: datetime
    updated_at: datetime
