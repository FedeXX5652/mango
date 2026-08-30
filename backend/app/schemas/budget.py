import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.account import Currency

BudgetPeriod = Literal["weekly", "monthly", "yearly"]


class BudgetCreate(BaseModel):
    id: uuid.UUID
    category_id: uuid.UUID
    period: BudgetPeriod = "monthly"
    # Primer dia del periodo (para mensual/anual, dia 1).
    period_start: date
    amount: int = Field(ge=0)
    currency: Currency
    rollover: bool = False


class BudgetUpdate(BaseModel):
    amount: int | None = Field(default=None, ge=0)
    rollover: bool | None = None


class BudgetRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    category_id: uuid.UUID
    period: BudgetPeriod
    period_start: date
    period_end: date
    amount: int
    currency: str
    rollover: bool
    # Calculados: gastado en el periodo y lo que queda disponible.
    spent: int
    available: int
    created_at: datetime
    updated_at: datetime
