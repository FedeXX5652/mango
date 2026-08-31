import uuid

from sqlalchemy import Boolean, ForeignKey, Index, Text, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models._base import IdMixin, TimestampMixin


class Tag(Base, IdMixin, TimestampMixin):
    """Etiqueta: dimension separada de la categoria (proyecto/viaje). Ver 3.6."""

    __tablename__ = "tags"

    owner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    group_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("groups.id"))
    name: Mapped[str] = mapped_column(Text, nullable=False)
    color: Mapped[str | None] = mapped_column(Text)
    archived: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))


class TransactionTag(Base, IdMixin, TimestampMixin):
    __tablename__ = "transaction_tags"

    transaction_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("transactions.id"), nullable=False)
    tag_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tags.id"), nullable=False)

    __table_args__ = (
        # Unico parcial: respeta el borrado logico (ver 0003).
        Index(
            "transaction_tags_uniq",
            "transaction_id",
            "tag_id",
            unique=True,
            postgresql_where=text("deleted_at IS NULL"),
        ),
        Index(
            "transaction_tags_tag_idx",
            "tag_id",
            postgresql_where=text("deleted_at IS NULL"),
        ),
    )
