"""tarjeta es una cuenta

La tarjeta de credito es una cuenta con sus datos, y los medios de pago se van
(0034). Este es el paso de EXPANDIR (0012): todo lo nuevo es opcional y los
medios de pago siguen en la base para los clientes 1.10; se borran en una
version posterior.

1. `accounts`: los datos de la tarjeta (`brand`, `last4`, `closing_day`,
   `due_day`, `credit_limit`) y `parent_account_id`, el saldo en otra moneda de
   la misma tarjeta. CHECK: solo en una tarjeta, y un saldo secundario no tiene
   datos propios. Indice unico: un saldo por moneda en cada tarjeta.
2. `transactions.installments`: compra en cuotas. NULL = una sola.
3. `reminders.account_id`: el "Avisarme" de una tarjeta sigue a su cuenta. El
   CHECK de un solo vinculo pasa a contar los tres.
4. Datos: cada medio de tipo tarjeta de credito pasa sus datos a su cuenta (la
   de `default_account_id`; si no, la tarjeta asociada; si no, la tarjeta donde
   estan sus movimientos) sin pisar lo que la cuenta ya tenga, y sus
   recordatorios pasan a seguir a la cuenta. Un medio sin cuenta de tarjeta se
   deja como esta.

El downgrade saca todo lo nuevo. Los recordatorios que pasaron a una cuenta
quedan sin vinculo: el medio de pago no se reconstruye.

Revision ID: 0d0d01d20101
Revises: fc60ad494803
Create Date: 2026-10-30 16:58:10.936129

"""

import re
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0d0d01d20101"
down_revision: str | None = "fc60ad494803"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_TARJETA_CHK = (
    "type = 'credit_card' OR (brand IS NULL AND last4 IS NULL AND closing_day IS NULL"
    " AND due_day IS NULL AND credit_limit IS NULL AND parent_account_id IS NULL)"
)
_SECUNDARIO_CHK = (
    "parent_account_id IS NULL OR (brand IS NULL AND last4 IS NULL"
    " AND closing_day IS NULL AND due_day IS NULL AND credit_limit IS NULL)"
)


def upgrade() -> None:
    op.add_column("accounts", sa.Column("brand", sa.Text(), nullable=True))
    op.add_column("accounts", sa.Column("last4", sa.Text(), nullable=True))
    op.add_column("accounts", sa.Column("closing_day", sa.SmallInteger(), nullable=True))
    op.add_column("accounts", sa.Column("due_day", sa.SmallInteger(), nullable=True))
    op.add_column("accounts", sa.Column("credit_limit", sa.BigInteger(), nullable=True))
    op.add_column("accounts", sa.Column("parent_account_id", sa.UUID(), nullable=True))
    op.create_foreign_key(
        "accounts_parent_account_id_fkey", "accounts", "accounts", ["parent_account_id"], ["id"]
    )
    op.create_check_constraint("accounts_tarjeta_chk", "accounts", _TARJETA_CHK)
    op.create_check_constraint("accounts_saldo_secundario_chk", "accounts", _SECUNDARIO_CHK)
    op.create_check_constraint(
        "accounts_parent_chk", "accounts", "parent_account_id IS NULL OR parent_account_id <> id"
    )
    op.create_check_constraint(
        "accounts_closing_chk", "accounts", "closing_day IS NULL OR closing_day BETWEEN 1 AND 31"
    )
    op.create_check_constraint(
        "accounts_due_chk", "accounts", "due_day IS NULL OR due_day BETWEEN 1 AND 31"
    )
    op.create_check_constraint(
        "accounts_last4_chk", "accounts", "last4 IS NULL OR last4 ~ '^[0-9]{4}$'"
    )
    op.create_check_constraint(
        "accounts_limit_chk", "accounts", "credit_limit IS NULL OR credit_limit >= 0"
    )
    op.create_index(
        "accounts_saldo_moneda_uniq",
        "accounts",
        ["parent_account_id", "currency"],
        unique=True,
        postgresql_where=sa.text("parent_account_id IS NOT NULL AND deleted_at IS NULL"),
    )

    op.add_column("transactions", sa.Column("installments", sa.SmallInteger(), nullable=True))
    op.create_check_constraint(
        "tx_installments_chk",
        "transactions",
        "installments IS NULL OR (installments BETWEEN 2 AND 99 AND kind = 'expense')",
    )

    op.add_column("reminders", sa.Column("account_id", sa.UUID(), nullable=True))
    op.create_foreign_key(
        "reminders_account_id_fkey", "reminders", "accounts", ["account_id"], ["id"]
    )
    op.drop_constraint("reminders_un_vinculo_chk", "reminders", type_="check")
    op.create_check_constraint(
        "reminders_un_vinculo_chk",
        "reminders",
        "num_nonnulls(payment_method_id, debt_id, account_id) <= 1",
    )
    op.create_index(
        "reminders_account_idx",
        "reminders",
        ["account_id"],
        unique=False,
        postgresql_where=sa.text("account_id IS NOT NULL"),
    )

    _medios_a_tarjetas()


def _medios_a_tarjetas() -> None:
    conn = op.get_bind()
    medios = conn.execute(
        sa.text(
            "SELECT id, owner_id, brand, last4, closing_day, due_day, default_account_id"
            " FROM payment_methods WHERE kind = 'credit_card' AND deleted_at IS NULL"
        )
    ).all()
    for pm in medios:
        # Su tarjeta: la de por defecto, despues la asociada, despues la que mas
        # movimientos suyos tiene. COALESCE: un `= NULL` ordenaria primero.
        destino = conn.execute(
            sa.text(
                """
                SELECT a.id FROM accounts a
                WHERE a.owner_id = :owner AND a.type = 'credit_card'
                  AND a.parent_account_id IS NULL AND a.deleted_at IS NULL
                  AND (a.id = :defecto
                       OR a.id IN (SELECT account_id FROM payment_method_accounts
                                   WHERE payment_method_id = :pm AND deleted_at IS NULL)
                       OR a.id IN (SELECT account_id FROM transactions
                                   WHERE payment_method_id = :pm AND deleted_at IS NULL))
                ORDER BY COALESCE(a.id = :defecto, false) DESC,
                         a.id IN (SELECT account_id FROM payment_method_accounts
                                  WHERE payment_method_id = :pm AND deleted_at IS NULL) DESC,
                         (SELECT count(*) FROM transactions t WHERE t.account_id = a.id
                            AND t.payment_method_id = :pm AND t.deleted_at IS NULL) DESC,
                         a.id
                LIMIT 1
                """
            ),
            {"owner": pm.owner_id, "defecto": pm.default_account_id, "pm": pm.id},
        ).scalar()
        if destino is None:
            continue
        last4 = pm.last4 if pm.last4 and re.fullmatch(r"[0-9]{4}", pm.last4) else None
        conn.execute(
            sa.text(
                """
                UPDATE accounts SET brand = COALESCE(brand, :brand),
                  last4 = COALESCE(last4, :last4), closing_day = COALESCE(closing_day, :cierre),
                  due_day = COALESCE(due_day, :vence), updated_at = now()
                WHERE id = :id
                """
            ),
            {
                "id": destino,
                "brand": pm.brand,
                "last4": last4,
                "cierre": pm.closing_day,
                "vence": pm.due_day,
            },
        )
        conn.execute(
            sa.text(
                "UPDATE reminders SET account_id = :id, payment_method_id = NULL,"
                " updated_at = now() WHERE payment_method_id = :pm AND deleted_at IS NULL"
            ),
            {"id": destino, "pm": pm.id},
        )


def downgrade() -> None:
    op.drop_index(
        "reminders_account_idx",
        table_name="reminders",
        postgresql_where=sa.text("account_id IS NOT NULL"),
    )
    op.drop_constraint("reminders_un_vinculo_chk", "reminders", type_="check")
    op.create_check_constraint(
        "reminders_un_vinculo_chk", "reminders", "payment_method_id IS NULL OR debt_id IS NULL"
    )
    op.drop_constraint("reminders_account_id_fkey", "reminders", type_="foreignkey")
    op.drop_column("reminders", "account_id")

    op.drop_constraint("tx_installments_chk", "transactions", type_="check")
    op.drop_column("transactions", "installments")

    op.drop_index(
        "accounts_saldo_moneda_uniq",
        table_name="accounts",
        postgresql_where=sa.text("parent_account_id IS NOT NULL AND deleted_at IS NULL"),
    )
    for nombre in (
        "accounts_limit_chk",
        "accounts_last4_chk",
        "accounts_due_chk",
        "accounts_closing_chk",
        "accounts_parent_chk",
        "accounts_saldo_secundario_chk",
        "accounts_tarjeta_chk",
    ):
        op.drop_constraint(nombre, "accounts", type_="check")
    op.drop_constraint("accounts_parent_account_id_fkey", "accounts", type_="foreignkey")
    for columna in (
        "parent_account_id",
        "credit_limit",
        "due_day",
        "closing_day",
        "last4",
        "brand",
    ):
        op.drop_column("accounts", columna)
