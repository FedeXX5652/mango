import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, field_validator


class TagCreate(BaseModel):
    # El id lo genera el cliente (decision 5.1).
    id: uuid.UUID
    name: str
    color: str | None = None

    @field_validator("name")
    @classmethod
    def nombre_no_vacio(cls, v: str) -> str:
        limpio = v.strip()
        if not limpio:
            raise ValueError("El nombre no puede estar vacio")
        return limpio


class TagUpdate(BaseModel):
    name: str | None = None
    color: str | None = None
    archived: bool | None = None

    @field_validator("name")
    @classmethod
    def nombre_no_vacio(cls, v: str | None) -> str | None:
        if v is None:
            return v
        limpio = v.strip()
        if not limpio:
            raise ValueError("El nombre no puede estar vacio")
        return limpio


class TagRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    color: str | None
    archived: bool
    created_at: datetime
    updated_at: datetime


class TransactionTagCreate(BaseModel):
    """Asocia una etiqueta a un movimiento. Un movimiento puede tener varias
    etiquetas o ninguna (ver 3.5.1)."""

    id: uuid.UUID
    transaction_id: uuid.UUID
    tag_id: uuid.UUID


class TransactionTagRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    transaction_id: uuid.UUID
    tag_id: uuid.UUID
    created_at: datetime
    updated_at: datetime
