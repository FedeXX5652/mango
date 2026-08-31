import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.account import Currency


class BudgetCreate(BaseModel):
    # Asignacion de un mes a un sobre (categoria). El id lo genera el cliente.
    id: uuid.UUID
    category_id: uuid.UUID
    # Primer dia del mes.
    period_start: date
    amount: int = Field(ge=0)
    currency: Currency


class BudgetUpdate(BaseModel):
    amount: int | None = Field(default=None, ge=0)


class BudgetRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    category_id: uuid.UUID
    period_start: date
    amount: int
    currency: str
    created_at: datetime
    updated_at: datetime


class BudgetRuleCreate(BaseModel):
    # Asignacion recurrente a un sobre (ver 3.6 / 0004). El id lo genera el cliente.
    id: uuid.UUID
    category_id: uuid.UUID
    amount: int = Field(ge=0)
    currency: Currency
    active: bool = True


class BudgetRuleUpdate(BaseModel):
    amount: int | None = Field(default=None, ge=0)
    active: bool | None = None


class BudgetRuleRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    category_id: uuid.UUID
    amount: int
    currency: str
    active: bool
    created_at: datetime
    updated_at: datetime
