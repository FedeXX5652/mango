import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class NotificationUpdate(BaseModel):
    # El cliente marca leido escribiendo read_at; el valor exacto no importa, el
    # servidor usa now(). Es lo unico que el cliente puede tocar de un aviso.
    read_at: datetime | None = None


class NotificationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    type: str
    title: str
    body: str
    link: str | None
    read_at: datetime | None
    created_at: datetime
