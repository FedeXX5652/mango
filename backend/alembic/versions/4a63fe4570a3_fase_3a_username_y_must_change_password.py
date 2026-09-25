"""fase 3a: username y must_change_password

Renombre email->username por expandir/contraer (decision 0012): se agrega
`username`, se rellena desde `email` y recien despues se marca NOT NULL. `email`
pasa a opcional (se borra en un release posterior, cuando ningun cliente lo
mande). Agregar `username` NOT NULL de una fallaria sobre las filas que ya
existen.

El backfill usa la parte local del email (`yo@mango.local` -> `yo`). Con un solo
usuario no hay colision; si mas adelante hubiera dos con la misma parte local, el
unico lo haria fallar aca, que es lo correcto (mejor ruidoso que ambiguo).

`must_change_password` arranca en false: los usuarios que ya existen tienen su
clave (o el placeholder del semilla, que igual no deja entrar).

Revision ID: 4a63fe4570a3
Revises: 87144bd48b1a
Create Date: 2026-09-25 14:56:28.237371

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "4a63fe4570a3"
down_revision: str | None = "87144bd48b1a"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("username", sa.Text(), nullable=True))
    op.add_column(
        "users",
        sa.Column(
            "must_change_password",
            sa.Boolean(),
            server_default=sa.text("false"),
            nullable=False,
        ),
    )
    # Backfill desde la parte local del email.
    op.execute("UPDATE users SET username = split_part(email, '@', 1) WHERE username IS NULL")
    op.alter_column("users", "username", nullable=False)
    op.create_unique_constraint("users_username_key", "users", ["username"])

    # email pasa a opcional (el contract futuro lo borra).
    op.alter_column("users", "email", existing_type=sa.TEXT(), nullable=True)


def downgrade() -> None:
    op.drop_constraint("users_username_key", "users", type_="unique")
    op.alter_column("users", "email", existing_type=sa.TEXT(), nullable=False)
    op.drop_column("users", "must_change_password")
    op.drop_column("users", "username")
