"""Esquemas de grupos y membresía (fase 3b)."""

import uuid
from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.account import Currency


class GroupCreate(BaseModel):
    # id del cliente (decision 5.1), como todo lo que crea el cliente.
    id: uuid.UUID
    name: str
    base_currency: Currency = "ARS"
    # Color del grupo, para distinguir su origen en toda la app (ver 3b.2c).
    color: str | None = None


# Partes de un miembro en el reparto por defecto: enteras y acotadas (60/40 se
# escribe 60 y 40; 2 a 1, 2 y 1).
Partes = Annotated[int, Field(ge=0, le=10000)]


class GroupUpdate(BaseModel):
    name: str | None = None
    color: str | None = None
    # Reparto por defecto (0026): {user_id: partes}. `null` vuelve a partes
    # iguales; no mandarlo no lo toca.
    default_split: dict[uuid.UUID, Partes] | None = None


class GroupRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    base_currency: str
    color: str | None
    default_split: dict[str, int] | None = None
    created_by: uuid.UUID
    created_at: datetime


class MemberAdd(BaseModel):
    # Se agrega por username: el admin ya sabe a quién suma (ver 0013).
    username: str


class MemberRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    group_id: uuid.UUID
    user_id: uuid.UUID
    role: str
