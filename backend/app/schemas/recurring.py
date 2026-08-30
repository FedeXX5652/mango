import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.account import Currency

TxKind = Literal["expense", "income", "transfer"]
Frequency = Literal["daily", "weekly", "monthly", "yearly"]


class RecurringCreate(BaseModel):
    id: uuid.UUID
    name: str
    kind: TxKind
    account_id: uuid.UUID
    transfer_account_id: uuid.UUID | None = None
    category_id: uuid.UUID | None = None
    payment_method_id: uuid.UUID | None = None
    amount: int = Field(ge=0)
    currency: Currency
    payee: str | None = None
    notes: str | None = None
    frequency: Frequency
    interval_count: int = Field(default=1, ge=1)
    day_of_period: int | None = None
    start_date: date
    end_date: date | None = None
    next_run_date: date
    auto_create: bool = True
    active: bool = True


class RecurringUpdate(BaseModel):
    name: str | None = None
    amount: int | None = Field(default=None, ge=0)
    payee: str | None = None
    notes: str | None = None
    frequency: Frequency | None = None
    interval_count: int | None = Field(default=None, ge=1)
    day_of_period: int | None = None
    end_date: date | None = None
    next_run_date: date | None = None
    auto_create: bool | None = None
    active: bool | None = None


class RecurringRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    kind: TxKind
    account_id: uuid.UUID
    transfer_account_id: uuid.UUID | None
    category_id: uuid.UUID | None
    payment_method_id: uuid.UUID | None
    amount: int
    currency: str
    payee: str | None
    notes: str | None
    frequency: Frequency
    interval_count: int
    day_of_period: int | None
    start_date: date
    end_date: date | None
    next_run_date: date
    auto_create: bool
    active: bool
    created_at: datetime
    updated_at: datetime


class RecurringRunResult(BaseModel):
    generated: int
    transaction_ids: list[uuid.UUID]
