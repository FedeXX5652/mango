import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict

from app.schemas.account import Currency

ColorScheme = Literal["light", "dark", "system"]


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    display_name: str
    base_currency: str
    locale: str
    # Apariencia (per-user, viaja con la sync). Ver DESIGN.md seccion 5.
    theme_id: str
    theme_custom: dict[str, Any] | None
    color_scheme: ColorScheme
    created_at: datetime
    updated_at: datetime


class UserUpdate(BaseModel):
    display_name: str | None = None
    base_currency: Currency | None = None
    locale: str | None = None
    theme_id: str | None = None
    # Objeto {modo: {token: valor}} con solo los tokens sobreescritos.
    theme_custom: dict[str, Any] | None = None
    color_scheme: ColorScheme | None = None
