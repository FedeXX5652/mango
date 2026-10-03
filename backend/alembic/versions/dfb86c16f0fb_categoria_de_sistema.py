"""categoria de sistema

Categorias que crea el servidor y la app reconoce por una clave, no por el
nombre (0026, etapa 3). La primera es "Reintegros de grupo": la categoria con la
que llega cada cobro de un pago de grupo (0018), asi el acreedor no tiene que
elegir una para confirmarlo.

Aditiva (0012): columna opcional e indice unico parcial (una por usuario y clave
entre las vigentes). Baja con la categoria por `mio` (`SELECT *`).

Datos: a quien ya tiene cobros se le crea la categoria, y los cobros PENDIENTES
sin categoria la toman. Los ya confirmados conservan la que se eligio: los
reintegros se separan en Estadisticas por su vinculo con el pago
(`settlement_id`), no por la categoria.

Revision ID: dfb86c16f0fb
Revises: 7791c00c4eb5
Create Date: 2026-10-03 00:07:45.782977

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "dfb86c16f0fb"
down_revision: str | None = "7791c00c4eb5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("categories", sa.Column("system_key", sa.Text(), nullable=True))
    op.create_index(
        "categories_owner_system_key_uniq",
        "categories",
        ["owner_id", "system_key"],
        unique=True,
        postgresql_where=sa.text("system_key IS NOT NULL AND deleted_at IS NULL"),
    )
    # La categoria para quien ya recibio cobros (con id del servidor: la crea
    # el servidor, como el cobro mismo).
    op.execute(
        """
        INSERT INTO categories (id, owner_id, name, kind, icon, system_key)
        SELECT gen_random_uuid(), t.owner_id, 'Reintegros de grupo', 'income', 'reintegro',
               'reintegros_grupo'
        FROM (SELECT DISTINCT owner_id FROM transactions
              WHERE settlement_id IS NOT NULL AND deleted_at IS NULL) t
        WHERE NOT EXISTS (
            SELECT 1 FROM categories c
            WHERE c.owner_id = t.owner_id AND c.system_key = 'reintegros_grupo'
              AND c.deleted_at IS NULL
        )
        """
    )
    op.execute(
        """
        UPDATE transactions t SET category_id = c.id, updated_at = now()
        FROM categories c
        WHERE t.settlement_id IS NOT NULL AND t.status = 'pending'
          AND t.category_id IS NULL AND t.deleted_at IS NULL
          AND c.owner_id = t.owner_id AND c.system_key = 'reintegros_grupo'
          AND c.deleted_at IS NULL
        """
    )


def downgrade() -> None:
    # Las categorias creadas quedan como categorias comunes.
    op.drop_index(
        "categories_owner_system_key_uniq",
        table_name="categories",
        postgresql_where=sa.text("system_key IS NOT NULL AND deleted_at IS NULL"),
    )
    op.drop_column("categories", "system_key")
