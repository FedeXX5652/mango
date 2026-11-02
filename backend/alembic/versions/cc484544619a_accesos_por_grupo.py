"""accesos por grupo

Los accesos del Inicio de cada grupo, elegidos por cada persona como los
personales (1.13.0): `users.group_shortcuts`, {grupo: [ids]}. Va en la fila de
`users` y no en `group_members` para que se edite sin conexion, por la cola de
sync, igual que `home_shortcuts`. NULL = los de fabrica en todos los grupos.

Aditivo (0012): opcional y sin valor por defecto; un cliente viejo no lo
escribe y no lo baja (la sync de `users` lista sus columnas).

Revision ID: cc484544619a
Revises: 0d0d01d20102
Create Date: 2026-11-02 16:25:02.489011

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "cc484544619a"
down_revision: str | None = "0d0d01d20102"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("group_shortcuts", postgresql.JSONB(none_as_null=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "group_shortcuts")
