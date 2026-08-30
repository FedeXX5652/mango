import uuid
from datetime import datetime

from sqlalchemy import (
    CHAR,
    TIMESTAMP,
    CheckConstraint,
    ForeignKey,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models._base import IdMixin, TimestampMixin


class User(Base, IdMixin, TimestampMixin):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    password_hash: Mapped[str] = mapped_column(Text, nullable=False)
    display_name: Mapped[str] = mapped_column(Text, nullable=False)
    base_currency: Mapped[str] = mapped_column(
        CHAR(3), nullable=False, server_default=text("'ARS'")
    )
    locale: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'es-AR'"))


class Group(Base, IdMixin, TimestampMixin):
    __tablename__ = "groups"

    name: Mapped[str] = mapped_column(Text, nullable=False)
    base_currency: Mapped[str] = mapped_column(
        CHAR(3), nullable=False, server_default=text("'ARS'")
    )
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)


class GroupMember(Base, IdMixin):
    __tablename__ = "group_members"

    group_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("groups.id"), nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    role: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'member'"))
    joined_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False, server_default=text("now()")
    )
    updated_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True),
        nullable=False,
        server_default=text("now()"),
        onupdate=text("now()"),
    )
    deleted_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True))

    __table_args__ = (
        CheckConstraint("role IN ('owner','member')", name="group_members_role_chk"),
        UniqueConstraint("group_id", "user_id", name="group_members_uniq"),
    )
