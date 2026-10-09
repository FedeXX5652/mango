"""recordatorios de grupo

Calendario de pagos, etapa 3 (1.6.0, ver 0030, C3): un recordatorio puede ser de
un grupo. Avisa a todos los miembros, cualquiera lo marca pagado y se frena para
todos, y lo edita o borra cualquier miembro (G4).
- `reminders.group_id` y `reminder_cycles.group_id` (la sync filtra sin JOIN).
- `reminder_cycles.snoozes`: en uno de grupo, el "Mas tarde" es de cada uno (G3),
  {user_id: instante ISO}. `snoozed_until` sigue siendo el de los personales.

Aditivo (0012): columnas opcionales. La sync cambia en el mismo deploy: los de
grupo van por el stream del grupo (hay que reiniciar PowerSync).

Revision ID: 20ecc9e47c11
Revises: 2a39a023ae5f
Create Date: 2026-10-09 01:05:04.337319

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "20ecc9e47c11"
down_revision: str | None = "2a39a023ae5f"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("reminders", sa.Column("group_id", sa.UUID(), nullable=True))
    op.add_column("reminder_cycles", sa.Column("group_id", sa.UUID(), nullable=True))
    op.add_column(
        "reminder_cycles",
        sa.Column("snoozes", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )
    # Con nombre: el `downgrade` los tiene que poder borrar.
    op.create_foreign_key("reminders_group_id_fkey", "reminders", "groups", ["group_id"], ["id"])
    op.create_foreign_key(
        "reminder_cycles_group_id_fkey", "reminder_cycles", "groups", ["group_id"], ["id"]
    )


def downgrade() -> None:
    op.drop_constraint("reminder_cycles_group_id_fkey", "reminder_cycles", type_="foreignkey")
    op.drop_constraint("reminders_group_id_fkey", "reminders", type_="foreignkey")
    op.drop_column("reminder_cycles", "snoozes")
    op.drop_column("reminder_cycles", "group_id")
    op.drop_column("reminders", "group_id")
