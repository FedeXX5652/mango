"""dueño en las tablas de union

`transaction_tags` y `payment_method_accounts` son tablas de union y el dueño se
deducia de su fila padre. Ahora lo llevan propio, porque **las reglas de sync no
hacen JOIN**: sin la columna no hay forma de mandarle a cada persona solo lo
suyo, y las dos tablas tendrian que quedar globales, filtrando a todo el mundo
las etiquetas de los movimientos ajenos.

Se agrega nullable, se rellena desde el padre y recien despues se marca NOT NULL:
en tablas con filas, agregarla NOT NULL de una falla.

Revision ID: 87144bd48b1a
Revises: 09afd07ec02b
Create Date: 2026-09-14 00:45:10.835490

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "87144bd48b1a"
down_revision: str | None = "09afd07ec02b"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("payment_method_accounts", sa.Column("owner_id", sa.UUID(), nullable=True))
    op.execute(
        "UPDATE payment_method_accounts pma SET owner_id = pm.owner_id"
        " FROM payment_methods pm WHERE pm.id = pma.payment_method_id"
    )
    op.alter_column("payment_method_accounts", "owner_id", nullable=False)
    op.create_foreign_key(
        "payment_method_accounts_owner_id_fkey",
        "payment_method_accounts",
        "users",
        ["owner_id"],
        ["id"],
    )

    op.add_column("transaction_tags", sa.Column("owner_id", sa.UUID(), nullable=True))
    op.execute(
        "UPDATE transaction_tags tt SET owner_id = t.owner_id"
        " FROM transactions t WHERE t.id = tt.transaction_id"
    )
    op.alter_column("transaction_tags", "owner_id", nullable=False)
    op.create_foreign_key(
        "transaction_tags_owner_id_fkey", "transaction_tags", "users", ["owner_id"], ["id"]
    )


def downgrade() -> None:
    op.drop_constraint("transaction_tags_owner_id_fkey", "transaction_tags", type_="foreignkey")
    op.drop_column("transaction_tags", "owner_id")
    op.drop_constraint(
        "payment_method_accounts_owner_id_fkey", "payment_method_accounts", type_="foreignkey"
    )
    op.drop_column("payment_method_accounts", "owner_id")
