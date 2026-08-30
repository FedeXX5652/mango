import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict

CategoryKind = Literal["expense", "income"]


class CategoryCreate(BaseModel):
    # El id lo genera el cliente (decision 5.1).
    id: uuid.UUID
    name: str
    kind: CategoryKind
    # Si viene, es una subcategoria: el padre debe existir y ser de primer nivel.
    parent_id: uuid.UUID | None = None
    color: str | None = None
    icon: str | None = None
    sort_order: int = 0


class CategoryUpdate(BaseModel):
    # No se permite mover de padre ni cambiar el kind en fase 1: rompe coherencia
    # de subcategorias y de transacciones ya clasificadas.
    name: str | None = None
    color: str | None = None
    icon: str | None = None
    sort_order: int | None = None
    archived: bool | None = None


class CategoryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    kind: CategoryKind
    parent_id: uuid.UUID | None
    color: str | None
    icon: str | None
    sort_order: int
    archived: bool
    created_at: datetime
    updated_at: datetime
