import json
import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, field_validator

from app.schemas.account import Currency

ColorScheme = Literal["light", "dark", "system"]


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    display_name: str
    base_currency: str
    # Apariencia (per-user, viaja con la sync). Ver DESIGN.md seccion 5.
    theme_id: str
    color_scheme: ColorScheme
    # Monedas que el usuario carga a mano (fuera del refresco automatico).
    fx_manual: list[str] | None
    created_at: datetime
    updated_at: datetime


class UserUpdate(BaseModel):
    """Lo que se puede modificar de un usuario.

    Llega **por la sincronizacion**: el cliente escribe la fila en su SQLite y
    PowerSync la sube. Ahi `fx_manual` es una columna de TEXTO con el JSON
    adentro, porque SQLite no tiene arrays; en Postgres es JSONB. La costura se
    cose aca y no en el cliente, que manda lo que su base tiene.
    """

    display_name: str | None = None
    base_currency: Currency | None = None
    theme_id: str | None = None
    color_scheme: ColorScheme | None = None
    fx_manual: list[Currency] | None = None

    @field_validator("fx_manual", mode="before")
    @classmethod
    def _lista_o_json(cls, v: Any) -> Any:
        if isinstance(v, str):
            try:
                v = json.loads(v)
            except ValueError as exc:
                raise ValueError("fx_manual debe ser una lista o el JSON de una lista") from exc
        return v
