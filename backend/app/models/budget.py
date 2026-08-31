import uuid
from datetime import date

from sqlalchemy import (
    CHAR,
    BigInteger,
    Boolean,
    Date,
    ForeignKey,
    Index,
    Text,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models._base import IdMixin, TimestampMixin


class Budget(Base, IdMixin, TimestampMixin):
    """Asignacion mensual a un sobre (categoria) para un mes (period_start = dia
    1). Los sobres son mensuales; el arrastre vive en la categoria (rollover) y
    la asignacion recurrente en budget_rules. Ver ESPECIFICACION 3.6 y 0004."""

    __tablename__ = "budgets"

    owner_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    group_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("groups.id"))
    category_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("categories.id"), nullable=False)
    # Primer dia del mes.
    period_start: Mapped[date] = mapped_column(Date, nullable=False)
    amount: Mapped[int] = mapped_column(BigInteger, nullable=False)
    currency: Mapped[str] = mapped_column(CHAR(3), nullable=False)

    __table_args__ = (
        # Unico parcial (respeta borrado logico, ver 0003) y NULLS NOT DISTINCT:
        # con group_id NULL (fase 1) un unique comun no deduplicaria. Una
        # asignacion por (sobre, mes).
        Index(
            "budgets_uniq",
            "owner_id",
            "group_id",
            "category_id",
            "period_start",
            unique=True,
            postgresql_where=text("deleted_at IS NULL"),
            postgresql_nulls_not_distinct=True,
        ),
    )


class BudgetRule(Base, IdMixin, TimestampMixin):
    """Asignacion recurrente a un sobre: cada mes, el sistema crea la fila de
    budgets del mes con este monto si todavia no existe una (no pisa lo asignado
    a mano). Reemplaza al viejo default_budget; se aplica desde /recurring/run.
    Ver ESPECIFICACION 3.6 y decision 0004."""

    __tablename__ = "budget_rules"

    owner_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    group_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("groups.id"))
    category_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("categories.id"), nullable=False)
    amount: Mapped[int] = mapped_column(BigInteger, nullable=False)
    currency: Mapped[str] = mapped_column(CHAR(3), nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))

    __table_args__ = (
        # Una regla activa por (sobre) — unico parcial que respeta el borrado
        # logico y NULLS NOT DISTINCT por el group_id NULL de fase 1 (ver 0003).
        Index(
            "budget_rules_uniq",
            "owner_id",
            "group_id",
            "category_id",
            unique=True,
            postgresql_where=text("deleted_at IS NULL"),
            postgresql_nulls_not_distinct=True,
        ),
    )


class Goal(Base, IdMixin, TimestampMixin):
    __tablename__ = "goals"

    owner_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    group_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("groups.id"))
    name: Mapped[str] = mapped_column(Text, nullable=False)
    target_amount: Mapped[int] = mapped_column(BigInteger, nullable=False)
    currency: Mapped[str] = mapped_column(CHAR(3), nullable=False)
    target_date: Mapped[date | None] = mapped_column(Date)
    account_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("accounts.id"))
    archived: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))
