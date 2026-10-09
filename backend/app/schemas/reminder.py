"""Esquemas del calendario de pagos (1.5.0, ver 0030)."""

import json
import uuid
from datetime import date, datetime
from typing import Annotated, Any, Literal

from pydantic import BaseModel, BeforeValidator, ConfigDict, Field, StringConstraints

Frecuencia = Literal["once", "daily", "weekly", "monthly", "yearly"]
ModoMes = Literal["day", "weekday"]
SemanaDelMes = Literal[1, 2, 3, 4, -1]
Corrimiento = Literal["none", "next", "previous"]
EstadoCiclo = Literal["pending", "paid", "skipped"]

Titulo = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
# "HH:MM" entre las 08:00 y las 21:59: nada entre las 22 y las 8 (decision del
# usuario, C6).
Hora = Annotated[str, StringConstraints(pattern=r"^(0[89]|1\d|2[01]):[0-5]\d$")]


class Aviso(BaseModel):
    days_before: int = Field(ge=0, le=30)
    time: Hora


def _lista_o_json(v: Any) -> Any:
    """En el telefono `alerts` es el texto de un JSON (SQLite no tiene arrays): se
    acepta la lista o su JSON, como `home_shortcuts`."""
    if isinstance(v, str):
        try:
            return json.loads(v)
        except ValueError as exc:
            raise ValueError("debe ser una lista o el JSON de una lista") from exc
    return v


Avisos = Annotated[list[Aviso], BeforeValidator(_lista_o_json), Field(max_length=10)]


class ReminderCreate(BaseModel):
    # El id lo genera el cliente (regla 2).
    id: uuid.UUID
    title: Titulo
    notes: str | None = Field(default=None, max_length=1000)
    template_id: uuid.UUID | None = None
    freq: Frecuencia
    interval_count: int = Field(default=1, ge=1, le=99)
    weekdays: int | None = Field(default=None, ge=1, le=127)
    month_mode: ModoMes | None = None
    month_day: int | None = Field(default=None, ge=1, le=31)
    month_week: SemanaDelMes | None = None
    month_weekday: int | None = Field(default=None, ge=0, le=6)
    start_date: date
    until_date: date | None = None
    count: int | None = Field(default=None, ge=1, le=999)
    # Sin valor por defecto: se elige al crear (C4).
    weekend_shift: Corrimiento
    track_from: date
    alerts: Avisos = Field(default_factory=lambda: [Aviso(days_before=0, time="09:00")])
    # NULL = hasta que se responda; 0 = no se sigue avisando.
    followup_days: int | None = Field(default=3, ge=0, le=30)


class ReminderUpdate(BaseModel):
    """Todo opcional. La coherencia de la regla se valida con lo que queda (lo
    que ya habia mas lo que cambia), en el CRUD."""

    title: Titulo | None = None
    notes: str | None = Field(default=None, max_length=1000)
    template_id: uuid.UUID | None = None
    freq: Frecuencia | None = None
    interval_count: int | None = Field(default=None, ge=1, le=99)
    weekdays: int | None = Field(default=None, ge=1, le=127)
    month_mode: ModoMes | None = None
    month_day: int | None = Field(default=None, ge=1, le=31)
    month_week: SemanaDelMes | None = None
    month_weekday: int | None = Field(default=None, ge=0, le=6)
    start_date: date | None = None
    until_date: date | None = None
    count: int | None = Field(default=None, ge=1, le=999)
    weekend_shift: Corrimiento | None = None
    track_from: date | None = None
    alerts: Avisos | None = None
    followup_days: int | None = Field(default=None, ge=0, le=30)


class ReminderRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    notes: str | None
    template_id: uuid.UUID | None
    freq: str
    interval_count: int
    weekdays: int | None
    month_mode: str | None
    month_day: int | None
    month_week: int | None
    month_weekday: int | None
    start_date: date
    until_date: date | None
    count: int | None
    weekend_shift: str
    track_from: date
    alerts: list[dict]
    followup_days: int | None
    created_at: datetime
    updated_at: datetime


class ReminderCycleCreate(BaseModel):
    """Alta o actualizacion de un ciclo (upsert por id): el id es determinista,
    `id_ciclo(reminder_id, nominal_date)`, y dos dispositivos pueden mandar el
    mismo."""

    id: uuid.UUID
    reminder_id: uuid.UUID
    nominal_date: date
    status: EstadoCiclo
    transaction_id: uuid.UUID | None = None
    # "Mas tarde" (etapa 2): hasta cuando callar este vencimiento.
    snoozed_until: datetime | None = None


class ReminderCycleUpdate(BaseModel):
    status: EstadoCiclo | None = None
    transaction_id: uuid.UUID | None = None
    snoozed_until: datetime | None = None


class ReminderCycleRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    reminder_id: uuid.UUID
    nominal_date: date
    status: str
    answered_at: datetime | None
    answered_by: uuid.UUID | None
    transaction_id: uuid.UUID | None
    snoozed_until: datetime | None
    created_at: datetime
    updated_at: datetime


class AccionDelAviso(BaseModel):
    """Un boton del aviso push, con el permiso de un solo uso que trajo."""

    token: str = Field(min_length=20, max_length=100)
    accion: Literal["pagado", "mas-tarde"]
