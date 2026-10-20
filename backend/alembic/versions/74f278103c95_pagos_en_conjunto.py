"""pagos en conjunto

Quien puso cuanto en un gasto compartido (1.8.0, ver 0032).

- `transaction_payers`: los otros que pusieron plata (un miembro o la cuenta
  conjunta), con el estado de su confirmacion.
- `transactions.amount_owner`: lo que puso quien lo cargo, si pusieron otros
  (`amount` sigue siendo el total). `transactions.paid_for_id`: el pago de un
  miembro apunta al gasto compartido.
- `tx_confirmed_chk` se afloja: sin cuenta si quien lo cargo no puso nada.

Aditivo (0012): columnas opcionales, tabla nueva y una restriccion mas floja. La
sync cambia en el mismo deploy (reiniciar PowerSync).

Revision ID: 74f278103c95
Revises: f991e405f7ed
Create Date: 2026-10-19

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "74f278103c95"
down_revision: str | None = "f991e405f7ed"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "transaction_payers",
        sa.Column("transaction_id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=True),
        sa.Column("account_id", sa.UUID(), nullable=True),
        sa.Column("amount", sa.BigInteger(), nullable=False),
        sa.Column("status", sa.Text(), server_default=sa.text("'pending'"), nullable=False),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("deleted_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.CheckConstraint("status IN ('pending','confirmed','rejected')", name="payer_status_chk"),
        sa.CheckConstraint("(user_id IS NULL) <> (account_id IS NULL)", name="payer_quien_chk"),
        sa.CheckConstraint("amount >= 0", name="payer_amount_chk"),
        sa.ForeignKeyConstraint(["account_id"], ["accounts.id"]),
        sa.ForeignKeyConstraint(["transaction_id"], ["transactions.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "payer_conjunta_uniq",
        "transaction_payers",
        ["transaction_id"],
        unique=True,
        postgresql_where=sa.text("account_id IS NOT NULL AND deleted_at IS NULL"),
    )
    op.create_index(
        "payer_miembro_uniq",
        "transaction_payers",
        ["transaction_id", "user_id"],
        unique=True,
        postgresql_where=sa.text("user_id IS NOT NULL AND deleted_at IS NULL"),
    )
    op.create_index(
        "payer_tx_idx",
        "transaction_payers",
        ["transaction_id"],
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    op.add_column("transactions", sa.Column("amount_owner", sa.BigInteger(), nullable=True))
    op.add_column("transactions", sa.Column("paid_for_id", sa.UUID(), nullable=True))
    # Con nombre: el `downgrade` la tiene que poder borrar.
    op.create_foreign_key(
        "transactions_paid_for_id_fkey", "transactions", "transactions", ["paid_for_id"], ["id"]
    )
    op.create_check_constraint(
        "tx_amount_owner_chk",
        "transactions",
        "amount_owner IS NULL OR amount_owner BETWEEN 0 AND amount",
    )
    op.drop_constraint("tx_confirmed_chk", "transactions", type_="check")
    op.create_check_constraint(
        "tx_confirmed_chk",
        "transactions",
        "status <> 'confirmed' OR account_id IS NOT NULL OR amount_owner = 0",
    )


def downgrade() -> None:
    op.drop_constraint("tx_confirmed_chk", "transactions", type_="check")
    op.create_check_constraint(
        "tx_confirmed_chk", "transactions", "status <> 'confirmed' OR account_id IS NOT NULL"
    )
    op.drop_constraint("tx_amount_owner_chk", "transactions", type_="check")
    op.drop_constraint("transactions_paid_for_id_fkey", "transactions", type_="foreignkey")
    op.drop_column("transactions", "paid_for_id")
    op.drop_column("transactions", "amount_owner")
    op.drop_index("payer_tx_idx", table_name="transaction_payers")
    op.drop_index("payer_miembro_uniq", table_name="transaction_payers")
    op.drop_index("payer_conjunta_uniq", table_name="transaction_payers")
    op.drop_table("transaction_payers")
