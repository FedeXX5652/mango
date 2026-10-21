"""usuario sin mayusculas y ajuste de saldo

Dos cambios de la 1.10.0:

1. `users.username` unico SIN distinguir mayusculas: un indice unico sobre
   lower(username) reemplaza a la unique de antes, que dejaba crear "Ana" y
   "ana". Entra en un solo paso aunque un indice unico nuevo sea, en general,
   un cambio que pide expandir y contraer (0012): ningun cliente escribe
   `username` (los usuarios se crean por script), asi que no hay escrituras en
   cola que el indice pueda rechazar.

2. Las categorias del sistema del ajuste de saldo (0033), una por kind, para
   los usuarios que ya existen. El ajuste se carga sin conexion: la categoria
   tiene que estar sincronizada antes. A los usuarios nuevos se las asegura el
   login.

Revision ID: fc60ad494803
Revises: c472860db607
Create Date: 2026-10-20 23:41:54.092979

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "fc60ad494803"
down_revision: str | None = "c472860db607"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_AJUSTES = (("ajuste_ingreso", "income"), ("ajuste_egreso", "expense"))


def upgrade() -> None:
    choques = (
        op.get_bind()
        .execute(
            sa.text(
                "SELECT lower(username) FROM users GROUP BY lower(username) HAVING count(*) > 1"
            )
        )
        .scalars()
        .all()
    )
    if choques:
        # Mejor frenar con el nombre que fallar con un error de indice: hay que
        # decidir a mano cual de los dos se renombra.
        raise RuntimeError(f"Usernames que solo difieren en mayusculas: {', '.join(choques)}")
    op.drop_constraint("users_username_key", "users", type_="unique")
    op.create_index("users_username_lower_uniq", "users", [sa.text("lower(username)")], unique=True)

    for clave, kind in _AJUSTES:
        op.execute(
            sa.text(
                """
                INSERT INTO categories (id, owner_id, name, kind, icon, system_key, sort_order)
                SELECT gen_random_uuid(), u.id, 'Ajuste de cuenta', :kind, 'ajuste', :clave, 999
                FROM users u
                WHERE NOT EXISTS (
                    SELECT 1 FROM categories c
                    WHERE c.owner_id = u.id AND c.system_key = :clave AND c.deleted_at IS NULL
                )
                """
            ).bindparams(clave=clave, kind=kind)
        )


def downgrade() -> None:
    # Las categorias pueden tener movimientos: se dan de baja, no se borran.
    op.execute(
        "UPDATE categories SET deleted_at = now() "
        "WHERE system_key IN ('ajuste_ingreso', 'ajuste_egreso') AND deleted_at IS NULL"
    )
    op.drop_index("users_username_lower_uniq", table_name="users")
    op.create_unique_constraint("users_username_key", "users", ["username"])
