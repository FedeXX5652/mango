"""publicacion de powersync

PowerSync replica la base por WAL logico y necesita una PUBLICATION de Postgres
llamada `powersync`. En el entorno de desarrollo se habia creado a mano y no
estaba en ningun lado del repo: una instalacion nueva arrancaba sin ella y
PowerSync fallaba con "Publication 'powersync' does not exist" (PSYNC_S1141), sin
sincronizar nada. La prueba de punta a punta del deploy por imagenes lo destapo
(ver 0020).

Aca queda reproducible. Idempotente: donde ya existe (desarrollo) no hace nada.
`FOR ALL TABLES` incluye las tablas que se agreguen despues sin tocar esto.
Requiere superusuario, que es el usuario de la base en el contenedor de postgres.

Como la API migra al arrancar y PowerSync arranca despues (depends_on healthy),
la publication existe antes de que PowerSync la busque.

Revision ID: 9f9351623312
Revises: 885eb44a7d8c
Create Date: 2026-09-27 21:46:03.945713

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "9f9351623312"
down_revision: str | None = "885eb44a7d8c"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'powersync') THEN
                CREATE PUBLICATION powersync FOR ALL TABLES;
            END IF;
        END
        $$;
        """
    )


def downgrade() -> None:
    op.execute("DROP PUBLICATION IF EXISTS powersync")
