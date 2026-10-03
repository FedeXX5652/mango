"""Esquemas de las notificaciones push (1.4.0, Web Push)."""

import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

# El endpoint lo da el servicio de push del navegador; siempre es https.
Endpoint = Annotated[str, StringConstraints(pattern=r"^https://", max_length=2048)]

# Familias de aviso que un dispositivo puede aceptar o no.
TipoAviso = Literal["grupos", "recordatorios"]


class ClavesPush(BaseModel):
    p256dh: str = Field(min_length=1, max_length=200)
    auth: str = Field(min_length=1, max_length=100)


class PushSubscriptionCreate(BaseModel):
    # id del cliente (regla 2), como todo lo que crea el cliente. Si el endpoint
    # ya estaba suscripto, se actualiza esa fila y este id no se usa.
    id: uuid.UUID
    endpoint: Endpoint
    keys: ClavesPush
    dispositivo: str | None = Field(default=None, max_length=120)
    # NULL = todos los tipos.
    tipos: list[TipoAviso] | None = None


class PushSubscriptionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    endpoint: str
    dispositivo: str | None
    tipos: list[str] | None
    created_at: datetime


class PushEndpoint(BaseModel):
    endpoint: Endpoint


class PushConfigRead(BaseModel):
    # Sin claves VAPID en el servidor no hay push: la app lo dice y no ofrece
    # activarlo. Los avisos siguen en la bandeja.
    disponible: bool
    clave_publica: str | None


class PushPruebaRead(BaseModel):
    enviados: int
