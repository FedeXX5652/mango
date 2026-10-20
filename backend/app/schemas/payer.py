"""Quien mas puso plata en un gasto compartido (1.8.0, ver 0032)."""

import uuid

from pydantic import BaseModel, ConfigDict, Field, model_validator


class PayerCreate(BaseModel):
    # id del cliente (regla 2). Es tambien el id del movimiento que el servidor le
    # crea a ese miembro para que confirme de que cuenta salio.
    id: uuid.UUID
    transaction_id: uuid.UUID
    # Un miembro del grupo, o la cuenta conjunta del grupo: uno de los dos.
    user_id: uuid.UUID | None = None
    account_id: uuid.UUID | None = None
    # Lo que puso, en centavos de la moneda del gasto (regla 1).
    amount: int = Field(ge=0)

    @model_validator(mode="after")
    def _uno_de_los_dos(self) -> "PayerCreate":
        if (self.user_id is None) == (self.account_id is None):
            raise ValueError("Va un miembro o la cuenta conjunta, uno de los dos")
        return self


class PayerUpdate(BaseModel):
    # Solo se cambia cuanto puso. Quien pago no se cambia: es otra fila.
    amount: int | None = Field(default=None, ge=0)


class PayerRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    transaction_id: uuid.UUID
    user_id: uuid.UUID | None
    account_id: uuid.UUID | None
    amount: int
    status: str
