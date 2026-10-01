"""accesos de inicio en users

Los accesos del panel de Inicio (0024): que atajos se muestran y en que orden.
Es una preferencia del usuario, como el tema: vive en `users` y viaja con la
sync, asi que es igual en todos sus dispositivos.

JSONB con una lista de ids del catalogo del cliente, como `fx_manual`. NULL =
los accesos de fabrica. Aditiva y opcional: un cliente viejo no la manda y no
pasa nada (0012).

Revision ID: 45f51c180886
Revises: 9f9351623312
Create Date: 2026-09-30 14:10:08.475907

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "45f51c180886"
down_revision: str | None = "9f9351623312"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("home_shortcuts", postgresql.JSONB(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "home_shortcuts")
