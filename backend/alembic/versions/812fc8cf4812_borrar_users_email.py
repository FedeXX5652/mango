"""borrar users.email

Contraer del renombre `email -> username` (fase 3a, ver 0012). El login usa
`username` desde entonces; `email` quedo opcional esperando este release. Nada lo
lee: no se sincroniza (la consulta de `users` va columna por columna) y ningun
cliente lo manda.

Sacar una columna es aditivo (0012): un payload viejo que la trajera se descarta.
El `downgrade` devuelve la columna vacia: los mails no vuelven.

Revision ID: 812fc8cf4812
Revises: 20ecc9e47c11
Create Date: 2026-10-12 22:47:31.026612

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "812fc8cf4812"
down_revision: str | None = "20ecc9e47c11"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_constraint("users_email_key", "users", type_="unique")
    op.drop_column("users", "email")


def downgrade() -> None:
    op.add_column("users", sa.Column("email", sa.Text(), nullable=True))
    op.create_unique_constraint("users_email_key", "users", ["email"])
