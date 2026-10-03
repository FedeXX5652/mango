"""push y planificador

Notificaciones push (1.4.0, Web Push con VAPID):

- `push_subscriptions`: la suscripcion de cada dispositivo (endpoint del servicio
  de push y claves para cifrarle). Estado del servidor: NO se sincroniza. Un
  endpoint vigente es un dispositivo (indice unico parcial).
- `notifications.pushed_at`: cuando salio el aviso por push. NULL = pendiente
  para el planificador.

Aditiva (0012). Datos: los avisos que ya existen se marcan como despachados
(`pushed_at = created_at`); si no, el primer minuto del planificador mandaria
por push toda la bandeja vieja.

Revision ID: 05da15d85869
Revises: dfb86c16f0fb
Create Date: 2026-10-03

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "05da15d85869"
down_revision: str | None = "dfb86c16f0fb"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "push_subscriptions",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("endpoint", sa.Text(), nullable=False),
        sa.Column("p256dh", sa.Text(), nullable=False),
        sa.Column("auth", sa.Text(), nullable=False),
        sa.Column("dispositivo", sa.Text(), nullable=True),
        sa.Column("tipos", postgresql.JSONB(), nullable=True),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("deleted_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "push_subscriptions_endpoint_uniq",
        "push_subscriptions",
        ["endpoint"],
        unique=True,
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    op.add_column(
        "notifications", sa.Column("pushed_at", sa.TIMESTAMP(timezone=True), nullable=True)
    )
    op.execute("UPDATE notifications SET pushed_at = created_at WHERE pushed_at IS NULL")


def downgrade() -> None:
    op.drop_column("notifications", "pushed_at")
    op.drop_index(
        "push_subscriptions_endpoint_uniq",
        table_name="push_subscriptions",
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    op.drop_table("push_subscriptions")
