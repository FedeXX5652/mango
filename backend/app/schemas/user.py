import json
import uuid
from datetime import datetime
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator

from app.schemas.account import Currency

ColorScheme = Literal["light", "dark", "system"]

# Id de un acceso de Inicio (0024): una palabra del catalogo del cliente
# ("metas", "deudas"). El servidor no conoce el catalogo, solo cuida la forma.
IdAcceso = Annotated[str, StringConstraints(pattern=r"^[a-z0-9-]{1,40}$")]


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
    # Accesos del panel de Inicio, en orden (0024). None = los de fabrica.
    home_shortcuts: list[str] | None
    snooze_default: str | None = None
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
    # El tope de la pantalla (4) lo pone el cliente; aca solo un techo holgado,
    # para no tener que aflojar una validacion si el panel crece (0012).
    home_shortcuts: list[IdAcceso] | None = Field(default=None, max_length=12)
    # Hasta cuando calla el boton "Mas tarde" del aviso (0030). NULL = 3 horas.
    snooze_default: Literal["1h", "3h", "manana"] | None = None

    @field_validator("fx_manual", "home_shortcuts", mode="before")
    @classmethod
    def _lista_o_json(cls, v: Any) -> Any:
        if isinstance(v, str):
            try:
                v = json.loads(v)
            except ValueError as exc:
                raise ValueError("debe ser una lista o el JSON de una lista") from exc
        return v
