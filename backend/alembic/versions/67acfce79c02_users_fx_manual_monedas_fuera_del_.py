"""users.fx_manual: monedas fuera del refresco automatico

Las cotizaciones se refrescan solas desde una API publica (ver 0005), pero hay
monedas que conviene cargar a mano: en Argentina la cotizacion oficial del dolar
que publica la API no es la que uno paga (MEP, tarjeta). Esta columna lista los
codigos ISO que el usuario maneja a mano.

NULL o lista vacia = todas automaticas.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "67acfce79c02"
down_revision: str | None = "cf4a0b40fbfa"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users", sa.Column("fx_manual", postgresql.JSONB(astext_type=sa.Text()), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("users", "fx_manual")
