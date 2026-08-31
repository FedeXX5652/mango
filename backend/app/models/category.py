import uuid

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    ForeignKey,
    Integer,
    Text,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models._base import IdMixin, TimestampMixin


class Category(Base, IdMixin, TimestampMixin):
    __tablename__ = "categories"

    owner_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    group_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("groups.id"))
    parent_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("categories.id"))
    name: Mapped[str] = mapped_column(Text, nullable=False)
    kind: Mapped[str] = mapped_column(Text, nullable=False)
    color: Mapped[str | None] = mapped_column(Text)
    icon: Mapped[str | None] = mapped_column(Text)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    archived: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))

    # Ajuste de sobre (el sobre ES la categoria, ver 3.6 / 0004).
    # rollover: el saldo arrastra al mes siguiente (sobre de ahorro). La
    # asignacion recurrente va por el sistema de recurrentes, no aca.
    rollover: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))

    __table_args__ = (CheckConstraint("kind IN ('expense','income')", name="categories_kind_chk"),)


class CategoryRule(Base, IdMixin, TimestampMixin):
    __tablename__ = "category_rules"

    owner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    match_type: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'contains'"))
    pattern: Mapped[str] = mapped_column(Text, nullable=False)
    category_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("categories.id"), nullable=False)
    priority: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("100"))
    source: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'user'"))

    __table_args__ = (
        CheckConstraint(
            "match_type IN ('exact','contains','regex')", name="category_rules_match_chk"
        ),
        CheckConstraint("source IN ('user','learned','ai')", name="category_rules_source_chk"),
    )
