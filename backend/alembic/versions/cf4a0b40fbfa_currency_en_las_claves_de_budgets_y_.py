"""currency en las claves de budgets y budget_rules

El sobre pasa a ser **categoria + moneda + mes** (decision 0005): una misma
categoria puede tener sobre en pesos para lo local y en dolares para los
pasajes, y son dos sobres distintos con su propio "por asignar".

Sin `currency` en la clave, cargar el segundo choca contra el unico y la fila se
rechaza. Los indices siguen siendo parciales (`WHERE deleted_at IS NULL`, ver
0003) y con `NULLS NOT DISTINCT` por el `group_id` NULL de fase 1.

Revision ID: cf4a0b40fbfa
Revises: 347ee3489bdd
Create Date: 2026-09-07 01:19:44.905030

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "cf4a0b40fbfa"
down_revision: str | None = "347ee3489bdd"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_PARCIAL = sa.text("deleted_at IS NULL")


def upgrade() -> None:
    op.drop_index("budgets_uniq", table_name="budgets")
    op.create_index(
        "budgets_uniq",
        "budgets",
        ["owner_id", "group_id", "category_id", "currency", "period_start"],
        unique=True,
        postgresql_where=_PARCIAL,
        postgresql_nulls_not_distinct=True,
    )
    op.drop_index("budget_rules_uniq", table_name="budget_rules")
    op.create_index(
        "budget_rules_uniq",
        "budget_rules",
        ["owner_id", "group_id", "category_id", "currency"],
        unique=True,
        postgresql_where=_PARCIAL,
        postgresql_nulls_not_distinct=True,
    )


def downgrade() -> None:
    # Volver atras solo es posible si ningun sobre tiene asignacion en dos
    # monedas para el mismo mes: si la hay, el unico mas corto la rechaza y hay
    # que decidir cual queda (no se puede convertir sin elegir una cotizacion).
    op.drop_index("budgets_uniq", table_name="budgets")
    op.create_index(
        "budgets_uniq",
        "budgets",
        ["owner_id", "group_id", "category_id", "period_start"],
        unique=True,
        postgresql_where=_PARCIAL,
        postgresql_nulls_not_distinct=True,
    )
    op.drop_index("budget_rules_uniq", table_name="budget_rules")
    op.create_index(
        "budget_rules_uniq",
        "budget_rules",
        ["owner_id", "group_id", "category_id"],
        unique=True,
        postgresql_where=_PARCIAL,
        postgresql_nulls_not_distinct=True,
    )
