import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.account import Currency

# payable = yo debo (me prestaron); receivable = me deben (yo preste).
DebtDirection = Literal["payable", "receivable"]


class DebtCreate(BaseModel):
    # El id lo genera el cliente (decision 5.1).
    id: uuid.UUID
    direction: DebtDirection
    counterparty: str
    description: str | None = None
    amount: int = Field(gt=0)
    currency: Currency
    due_date: date | None = None


class DebtUpdate(BaseModel):
    counterparty: str | None = None
    description: str | None = None
    amount: int | None = Field(default=None, gt=0)
    # Cuanto se saldo hasta ahora (pagos parciales). El CRUD marca settled_at
    # cuando llega al total.
    amount_settled: int | None = Field(default=None, ge=0)
    due_date: date | None = None


class DebtRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    direction: str
    counterparty: str
    description: str | None
    amount: int
    currency: str
    amount_settled: int
    due_date: date | None
    settled_at: datetime | None
    created_at: datetime
    updated_at: datetime
