"""dolar de cada cotizacion

Cotizaciones con los dolares argentinos y todo contra el USD (1.7.0, ver 0031).

- `exchange_rates.casa`: que dolar es una USD -> ARS automatica (oficial, mep,
  blue, tarjeta); NULL en el resto. Entra en el unico, con NULLS NOT DISTINCT
  para que `casa` NULL siga siendo unica. Aflojar un unico es aditivo (0012):
  lo que antes entraba sigue entrando.
- Las automaticas de antes se dan de baja (borrado logico): eran del dolar
  "oficial" internacional y contra la moneda base de cada uno (EUR -> ARS), y la
  serie nueva va contra el dolar. Una EUR -> ARS vieja le ganaria a la cuenta con
  el dolar elegido. La serie nueva la carga el planificador al arrancar.
- `users.fx_dolar`: el dolar de cada moneda, {moneda: casa}. NULL = MEP.

Lo cargado a mano no se toca.

El `downgrade` da de baja las filas con dolar (chocarian con el unico viejo) y no
devuelve las automaticas viejas: el refresco de antes vuelve a traer la del dia.

Revision ID: f991e405f7ed
Revises: 812fc8cf4812
Create Date: 2026-10-12 23:17:48.568545

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f991e405f7ed"
down_revision: str | None = "812fc8cf4812"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("exchange_rates", sa.Column("casa", sa.Text(), nullable=True))
    op.create_check_constraint(
        "fx_casa_chk",
        "exchange_rates",
        "casa IS NULL OR casa IN ('oficial','mep','blue','tarjeta')",
    )
    op.execute(
        "UPDATE exchange_rates SET deleted_at = now(), updated_at = now() "
        "WHERE source = 'auto' AND deleted_at IS NULL"
    )
    op.drop_index("fx_uniq", table_name="exchange_rates", postgresql_where="(deleted_at IS NULL)")
    op.create_index(
        "fx_uniq",
        "exchange_rates",
        ["base_currency", "quote_currency", "rate_date", "source", "casa"],
        unique=True,
        postgresql_where=sa.text("deleted_at IS NULL"),
        postgresql_nulls_not_distinct=True,
    )
    op.add_column(
        "users",
        sa.Column("fx_dolar", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "fx_dolar")
    op.execute(
        "UPDATE exchange_rates SET deleted_at = now(), updated_at = now() "
        "WHERE casa IS NOT NULL AND deleted_at IS NULL"
    )
    op.drop_index("fx_uniq", table_name="exchange_rates")
    op.create_index(
        "fx_uniq",
        "exchange_rates",
        ["base_currency", "quote_currency", "rate_date", "source"],
        unique=True,
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    op.drop_constraint("fx_casa_chk", "exchange_rates", type_="check")
    op.drop_column("exchange_rates", "casa")
