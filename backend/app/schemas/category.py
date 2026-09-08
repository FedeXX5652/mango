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
    # Ajuste de sobre (ver 3.6 / 0004). rollover = sobre de ahorro (acumula).
    rollover: bool = False


class CategoryUpdate(BaseModel):
    # `kind` sigue siendo inmutable: cambiarlo convertiria gastos en ingresos ya
    # clasificados.
    #
    # `parent_id` SI se puede cambiar, con las mismas reglas que al crear (dos
    # niveles, mismo kind). Hace falta para "eliminar y mover": al borrar una
    # categoria con subcategorias, estas pasan a colgar del destino. Antes el
    # campo no estaba y el PATCH respondia 200 **sin aplicar nada**, que es peor
    # que rechazarlo: el cliente creia que se habia movido.
    #
    # `None` explicito la convierte en categoria raiz. Por eso el default es un
    # centinela: no se puede distinguir "no lo mandes" de "ponelo en null" con
    # `None` solo, y `exclude_unset` lo resuelve del lado del CRUD.
    parent_id: uuid.UUID | None = None
    name: str | None = None
    color: str | None = None
    icon: str | None = None
    sort_order: int | None = None
    archived: bool | None = None
    rollover: bool | None = None


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
    rollover: bool
    created_at: datetime
    updated_at: datetime
