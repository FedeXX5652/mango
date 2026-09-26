import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.account import Currency


class SettlementCreate(BaseModel):
    # id del cliente (decision 5.1).
    id: uuid.UUID
    group_id: uuid.UUID
    from_user_id: uuid.UUID
    to_user_id: uuid.UUID
    amount: int = Field(gt=0)
    currency: Currency = "ARS"
    occurred_at: datetime
    note: str | None = None
    # Pago REAL (0017): la plata sale de esta cuenta/medio del que paga
    # (from_user_id). Si van NULL, es "marcar saldado": no mueve plata.
    account_id: uuid.UUID | None = None
    payment_method_id: uuid.UUID | None = None


class SettlementRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    group_id: uuid.UUID
    from_user_id: uuid.UUID
    to_user_id: uuid.UUID
    amount: int
    currency: str
    occurred_at: datetime
    note: str | None
    created_by: uuid.UUID
    account_id: uuid.UUID | None
    payment_method_id: uuid.UUID | None
