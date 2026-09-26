import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.account import Currency


class GoalCreate(BaseModel):
    # El id lo genera el cliente (decision 5.1).
    id: uuid.UUID
    name: str
    target_amount: int = Field(ge=0)
    currency: Currency
    target_date: date | None = None
    # Cuenta asociada: el progreso de la meta es el saldo de esa cuenta (fase 5).
    account_id: uuid.UUID | None = None


class GoalUpdate(BaseModel):
    name: str | None = None
    target_amount: int | None = Field(default=None, ge=0)
    target_date: date | None = None
    account_id: uuid.UUID | None = None
    archived: bool | None = None


class GoalRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    target_amount: int
    currency: str
    target_date: date | None
    account_id: uuid.UUID | None
    archived: bool
    created_at: datetime
    updated_at: datetime
