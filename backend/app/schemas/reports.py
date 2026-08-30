import uuid
from datetime import date

from pydantic import BaseModel


class AccountBalance(BaseModel):
    account_id: uuid.UUID
    name: str
    currency: str
    balance: int
    off_budget: bool
    archived: bool


class CurrencyTotal(BaseModel):
    currency: str
    total: int


class BalancesResponse(BaseModel):
    accounts: list[AccountBalance]
    net_worth: list[CurrencyTotal]


class CategoryTotal(BaseModel):
    category_id: uuid.UUID | None
    currency: str
    total: int


class MonthlyRow(BaseModel):
    month: date
    currency: str
    income: int
    expense: int
    net: int
