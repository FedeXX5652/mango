"""exchange_rates corregible y sincronizable

`exchange_rates` era append-only: solo `created_at`, y un UNIQUE de tabla sobre
(par, fecha, fuente). Con la carga manual de cotizaciones (ver 0005) hace falta
poder **corregir** una cotizacion cargada mal, y nada se borra fisicamente
(regla 3). Por eso:

- `updated_at` y `deleted_at`
- el UNIQUE pasa a **indice unico parcial** `WHERE deleted_at IS NULL`, si no
  una fila borrada seguiria ocupando el par y no se podria volver a cargar
  (decision 0003)
- indice por (par, fecha) para la consulta caliente: "la ultima cotizacion
  conocida de este par"

Revision ID: 347ee3489bdd
Revises: d64c41b7e606
Create Date: 2026-09-07 00:43:01.190041

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "347ee3489bdd"
down_revision: str | None = "d64c41b7e606"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "exchange_rates",
        sa.Column(
            "updated_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.add_column("exchange_rates", sa.Column("deleted_at", sa.TIMESTAMP(timezone=True)))
    # El UNIQUE de tabla y el indice comparten nombre: primero se suelta el uno.
    op.drop_constraint("fx_uniq", "exchange_rates", type_="unique")
    op.create_index(
        "fx_uniq",
        "exchange_rates",
        ["base_currency", "quote_currency", "rate_date", "source"],
        unique=True,
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    op.create_index(
        "fx_par_fecha",
        "exchange_rates",
        ["base_currency", "quote_currency", "rate_date"],
    )


def downgrade() -> None:
    op.drop_index("fx_par_fecha", table_name="exchange_rates")
    op.drop_index("fx_uniq", table_name="exchange_rates")
    # Volver al UNIQUE de tabla exige que no haya filas borradas ocupando un par
    # repetido; con datos reales habria que limpiarlas antes.
    op.create_unique_constraint(
        "fx_uniq",
        "exchange_rates",
        ["base_currency", "quote_currency", "rate_date", "source"],
    )
    op.drop_column("exchange_rates", "deleted_at")
    op.drop_column("exchange_rates", "updated_at")
