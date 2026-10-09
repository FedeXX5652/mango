"""plantillas de grupo

Calendario de pagos, etapa 3 (1.6.0, ver 0030, T1): una plantilla puede ser de
un grupo. Es de gasto, con una categoria del grupo y sin cuenta (cada uno paga
con la suya), y la edita o borra cualquier miembro. Sirve para "Cargar el pago"
de un recordatorio de grupo.
- `templates.group_id`.

Aditivo (0012): columna opcional. La sync cambia en el mismo deploy: las
plantillas de grupo van por el stream del grupo y las personales siguen por el
propio (hay que reiniciar PowerSync).

Revision ID: 2a39a023ae5f
Revises: 543883456c88
Create Date: 2026-10-09

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "2a39a023ae5f"
down_revision: str | None = "543883456c88"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("templates", sa.Column("group_id", sa.UUID(), nullable=True))
    # Con nombre: el `downgrade` lo tiene que poder borrar.
    op.create_foreign_key("templates_group_id_fkey", "templates", "groups", ["group_id"], ["id"])


def downgrade() -> None:
    op.drop_constraint("templates_group_id_fkey", "templates", type_="foreignkey")
    op.drop_column("templates", "group_id")
