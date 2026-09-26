import uuid

from pydantic import BaseModel, ConfigDict, Field


class SplitCreate(BaseModel):
    # id del cliente (decision 5.1).
    id: uuid.UUID
    transaction_id: uuid.UUID
    # A quien le corresponde esta parte. Debe ser miembro del grupo del gasto.
    user_id: uuid.UUID
    # Parte en centavos (regla 1). Cero es valido: excluir a alguien de un gasto.
    amount: int = Field(ge=0)
    category_id: uuid.UUID | None = None
    notes: str | None = None


class SplitUpdate(BaseModel):
    amount: int | None = Field(default=None, ge=0)
    category_id: uuid.UUID | None = None
    notes: str | None = None


class SplitRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    transaction_id: uuid.UUID
    user_id: uuid.UUID | None
    amount: int
    category_id: uuid.UUID | None
    notes: str | None
