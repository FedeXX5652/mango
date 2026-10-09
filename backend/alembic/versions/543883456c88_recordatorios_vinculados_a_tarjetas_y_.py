"""recordatorios vinculados a tarjetas y deudas

Calendario de pagos, etapa 3 (1.6.0, ver 0030): "Avisarme" en una tarjeta de
credito o en una deuda crea un recordatorio que la sigue. El servidor lo mantiene
al dia: si cambia el dia de vencimiento o la fecha, se mueve; saldar la deuda lo
marca pagado; borrar la tarjeta o la deuda lo borra.
- `reminders.payment_method_id`: la tarjeta (un medio de pago de credito).
- `reminders.debt_id`: la deuda.
- Uno u otro, no los dos.

Aditivo (0012): columnas opcionales. Un cliente viejo no las manda y la
restriccion no lo afecta.

Revision ID: 543883456c88
Revises: 2735ffa49768
Create Date: 2026-10-09 00:36:56.495876

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "543883456c88"
down_revision: str | None = "2735ffa49768"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("reminders", sa.Column("payment_method_id", sa.UUID(), nullable=True))
    op.add_column("reminders", sa.Column("debt_id", sa.UUID(), nullable=True))
    # Con nombre: el `downgrade` los tiene que poder borrar.
    op.create_foreign_key(
        "reminders_payment_method_id_fkey",
        "reminders",
        "payment_methods",
        ["payment_method_id"],
        ["id"],
    )
    op.create_foreign_key("reminders_debt_id_fkey", "reminders", "debts", ["debt_id"], ["id"])
    op.create_check_constraint(
        "reminders_un_vinculo_chk", "reminders", "payment_method_id IS NULL OR debt_id IS NULL"
    )
    # Parciales: casi ningun recordatorio sigue a algo.
    op.create_index(
        "reminders_payment_method_idx",
        "reminders",
        ["payment_method_id"],
        postgresql_where=sa.text("payment_method_id IS NOT NULL"),
    )
    op.create_index(
        "reminders_debt_idx",
        "reminders",
        ["debt_id"],
        postgresql_where=sa.text("debt_id IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("reminders_debt_idx", table_name="reminders")
    op.drop_index("reminders_payment_method_idx", table_name="reminders")
    op.drop_constraint("reminders_un_vinculo_chk", "reminders", type_="check")
    op.drop_constraint("reminders_debt_id_fkey", "reminders", type_="foreignkey")
    op.drop_constraint("reminders_payment_method_id_fkey", "reminders", type_="foreignkey")
    op.drop_column("reminders", "debt_id")
    op.drop_column("reminders", "payment_method_id")
