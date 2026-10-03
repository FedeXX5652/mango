"""reparto por defecto del grupo

El reparto con el que arranca un gasto nuevo del grupo (0026), como en
Splitwise: cuantas partes le tocan a cada miembro, `{user_id: partes}` (Casa
60/40 es `{ana: 60, beto: 40}`). NULL = partes iguales, que es lo de siempre.
Es solo el punto de partida del formulario: cada gasto sigue guardando su
reparto resuelto en `transaction_splits`.

Aditiva y opcional: un cliente viejo no la conoce y no pasa nada (0012). Baja
con la fila del grupo (`SELECT * FROM groups` en el stream `grupo`).

Revision ID: 7791c00c4eb5
Revises: 45f51c180886
Create Date: 2026-10-02 00:17:46.339794

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "7791c00c4eb5"
down_revision: str | None = "45f51c180886"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("groups", sa.Column("default_split", postgresql.JSONB(), nullable=True))


def downgrade() -> None:
    op.drop_column("groups", "default_split")
