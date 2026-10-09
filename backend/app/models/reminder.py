"""Calendario de pagos (1.5.0, ver 0030): recordatorios y sus ciclos.

Un recordatorio dice que hay que pagar algo y cuando (la regla de repeticion,
`services/repeticion.py`). Cada vencimiento es un ciclo; las fechas no se guardan,
se calculan con la regla. Un ciclo tiene fila solo cuando pasa algo con el: se
marco pagado u omitido (y despues, en la etapa 2, cuando el servidor avisa). Su
id es determinista (`repeticion.id_ciclo`): dos dispositivos que marcan el mismo
ciclo escriben la misma fila.
"""

import uuid
from datetime import date, datetime

from sqlalchemy import (
    CheckConstraint,
    Date,
    ForeignKey,
    Index,
    SmallInteger,
    Text,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, TIMESTAMP
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models._base import IdMixin, TimestampMixin


class Reminder(Base, IdMixin, TimestampMixin):
    __tablename__ = "reminders"

    owner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)
    # El monto, la cuenta y la categoria viven en la plantilla: "Cargar el pago"
    # abre el alta con ella. Si se borra la plantilla, se desvincula (NULL).
    template_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("templates.id"))

    # La regla de repeticion (ver services/repeticion.py y 0030).
    freq: Mapped[str] = mapped_column(Text, nullable=False)
    interval_count: Mapped[int] = mapped_column(
        SmallInteger, nullable=False, server_default=text("1")
    )
    weekdays: Mapped[int | None] = mapped_column(SmallInteger)
    month_mode: Mapped[str | None] = mapped_column(Text)
    month_day: Mapped[int | None] = mapped_column(SmallInteger)
    month_week: Mapped[int | None] = mapped_column(SmallInteger)
    month_weekday: Mapped[int | None] = mapped_column(SmallInteger)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    until_date: Mapped[date | None] = mapped_column(Date)
    count: Mapped[int | None] = mapped_column(SmallInteger)
    # Que hacer si vence sabado o domingo. Sin valor por defecto: se elige al
    # crear (decision del usuario, C4).
    weekend_shift: Mapped[str] = mapped_column(Text, nullable=False)
    # Desde cuando cuentan los vencimientos sin marcar. Al cambiar la regla pasa a
    # ser hoy: si no, las fechas viejas de la regla nueva aparecerian vencidas.
    track_from: Mapped[date] = mapped_column(Date, nullable=False)

    # Avisos de cada vencimiento: [{"days_before": 0, "time": "09:00"}, ...].
    alerts: Mapped[list[dict]] = mapped_column(
        JSONB,
        nullable=False,
        server_default=text("""'[{"days_before": 0, "time": "09:00"}]'::jsonb"""),
    )
    # Dias que se sigue avisando despues del vencimiento si no se responde.
    # NULL = hasta que se responda; 0 = no se sigue. Sin valor por defecto en la
    # base: NULL tiene significado (el 3 por defecto lo pone el esquema).
    followup_days: Mapped[int | None] = mapped_column(SmallInteger)

    __table_args__ = (
        CheckConstraint(
            "freq IN ('once','daily','weekly','monthly','yearly')", name="reminders_freq_chk"
        ),
        CheckConstraint("interval_count BETWEEN 1 AND 99", name="reminders_interval_chk"),
        CheckConstraint(
            "weekdays IS NULL OR weekdays BETWEEN 1 AND 127", name="reminders_weekdays_chk"
        ),
        CheckConstraint(
            "month_mode IS NULL OR month_mode IN ('day','weekday')",
            name="reminders_month_mode_chk",
        ),
        CheckConstraint(
            "month_day IS NULL OR month_day BETWEEN 1 AND 31", name="reminders_month_day_chk"
        ),
        CheckConstraint(
            "month_week IS NULL OR month_week IN (1, 2, 3, 4, -1)",
            name="reminders_month_week_chk",
        ),
        CheckConstraint(
            "month_weekday IS NULL OR month_weekday BETWEEN 0 AND 6",
            name="reminders_month_weekday_chk",
        ),
        CheckConstraint("count IS NULL OR count >= 1", name="reminders_count_chk"),
        CheckConstraint("count IS NULL OR until_date IS NULL", name="reminders_un_solo_fin_chk"),
        CheckConstraint(
            "weekend_shift IN ('none','next','previous')", name="reminders_weekend_shift_chk"
        ),
        CheckConstraint(
            "followup_days IS NULL OR followup_days BETWEEN 0 AND 30",
            name="reminders_followup_chk",
        ),
    )


class ReminderCycle(Base, IdMixin, TimestampMixin):
    __tablename__ = "reminder_cycles"

    # El del recordatorio: la sync filtra por dueno sin JOIN.
    owner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    reminder_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("reminders.id"), nullable=False)
    # La fecha que da la regla (no la corrida por el fin de semana): identifica al
    # ciclo aunque despues cambie que hacer con los sabados y domingos.
    nominal_date: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False)
    # Los pone el servidor al responder (pagado u omitido); NULL si esta pendiente.
    answered_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True))
    answered_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    # El pago cargado con "Cargar el pago", si lo hubo.
    transaction_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("transactions.id"))

    # --- Avisos (etapa 2) ---
    # "Mas tarde": calla este vencimiento hasta ese momento (nunca entre las 22 y
    # las 8). Lo pone la persona; el servidor lo limpia al avisar o al responder.
    snoozed_until: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True))
    # Lo que el servidor ya aviso, para no repetirlo: las claves de los avisos
    # ("3@09:00") y el ultimo dia de seguimiento. Solo los escribe el servidor.
    alerts_sent: Mapped[list[str] | None] = mapped_column(JSONB(none_as_null=True))
    followup_sent_on: Mapped[date | None] = mapped_column(Date)

    __table_args__ = (
        CheckConstraint(
            "status IN ('pending','paid','skipped')", name="reminder_cycles_status_chk"
        ),
        Index(
            "reminder_cycles_reminder_nominal_uniq",
            "reminder_id",
            "nominal_date",
            unique=True,
            postgresql_where=text("deleted_at IS NULL"),
        ),
    )


class ReminderActionToken(Base, IdMixin, TimestampMixin):
    """Permiso de un solo uso para los botones del aviso en Android ("Ya lo pagué",
    "Más tarde"; decision C5). El service worker no tiene la sesion: responde con
    este permiso. Se guarda el hash, no el permiso. No se sincroniza."""

    __tablename__ = "reminder_action_tokens"

    token_hash: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    reminder_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("reminders.id"), nullable=False)
    nominal_date: Mapped[date] = mapped_column(Date, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True))
