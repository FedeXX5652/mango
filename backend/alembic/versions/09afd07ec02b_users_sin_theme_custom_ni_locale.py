"""users sin theme_custom ni locale

Dos columnas que se guardaban y nadie leia.

`theme_custom` es el editor de temas personalizado, que la especificacion pone
explicitamente fuera de fase 1 ("sin editor todavia"): un JSONB que ninguna
pantalla escribia ni leia.

`locale` decide como se escriben numeros y fechas ("1.234,56" contra "1,234.56").
Estaba clavado en 'es-AR' y el cliente lo tiene escrito a mano igual. Si algun
dia hace falta que sea configurable, son cuatro constantes.

`display_name` se queda: en fase 3, con varios usuarios, hace falta para saber
quien cargo que.

Revision ID: 09afd07ec02b
Revises: 0eb63c85705d
Create Date: 2026-09-13 02:50:04.312323

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "09afd07ec02b"
down_revision: str | None = "0eb63c85705d"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_column("users", "theme_custom")
    op.drop_column("users", "locale")


def downgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "locale",
            sa.TEXT(),
            server_default=sa.text("'es-AR'::text"),
            autoincrement=False,
            nullable=False,
        ),
    )
    op.add_column(
        "users",
        sa.Column(
            "theme_custom",
            postgresql.JSONB(astext_type=sa.Text()),
            autoincrement=False,
            nullable=True,
        ),
    )
