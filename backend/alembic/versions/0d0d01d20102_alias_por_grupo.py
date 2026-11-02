"""alias por grupo

Cada miembro elige como se llama en cada grupo, y lo ve todo el grupo (0035).
`group_members.alias`, opcional: NULL = su nombre de Mango. Es aditivo (0012):
ningun cliente viejo lo escribe (los miembros se editan por la API, no por la
cola de sync) y el que no lo conoce lo ignora al bajar.

El CHECK pide un alias ya recortado y de 1 a 40 caracteres; el vacio se guarda
como NULL. El CRUD lo valida antes con un mensaje en palabras.

Revision ID: 0d0d01d20102
Revises: 0d0d01d20101
Create Date: 2026-11-02 12:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0d0d01d20102"
down_revision: str | None = "0d0d01d20101"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("group_members", sa.Column("alias", sa.Text(), nullable=True))
    op.create_check_constraint(
        "group_members_alias_chk",
        "group_members",
        "alias IS NULL OR (alias = btrim(alias) AND length(alias) BETWEEN 1 AND 40)",
    )


def downgrade() -> None:
    op.drop_constraint("group_members_alias_chk", "group_members", type_="check")
    op.drop_column("group_members", "alias")
