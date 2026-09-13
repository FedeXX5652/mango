"""recurrentes sin auto_create

Una recurrente es automatica, y punto. La columna permitia apagar la generacion,
pero apagada la regla no hacia **nada**: ni generaba ni avisaba, y en la lista se
veia igual que una prendida, con su "proxima fecha" hundiendose en el pasado. Era
una opcion que prometia algo que no existia.

Lo que si hacia falta era que las recurrentes funcionen sin conexion, y eso se
resolvio moviendo la generacion al dispositivo (ver ESPECIFICACION 3.7).

Revision ID: 0eb63c85705d
Revises: 67acfce79c02
Create Date: 2026-09-13 02:19:56.598078

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0eb63c85705d"
down_revision: str | None = "67acfce79c02"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_column("recurring_rules", "auto_create")


def downgrade() -> None:
    # Vuelve con el default en true: las reglas que existan quedan automaticas,
    # que es como se venian comportando.
    op.add_column(
        "recurring_rules",
        sa.Column(
            "auto_create",
            sa.BOOLEAN(),
            server_default=sa.text("true"),
            autoincrement=False,
            nullable=False,
        ),
    )
