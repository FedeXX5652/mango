"""Pruebas de las restricciones que la base impone en `transactions`.

Verifican que las reglas no negociables viven en el esquema, no solo en la app:
  - el monto es magnitud positiva (tx_amount_chk)
  - 'pending' nunca sale de una carga manual (tx_pending_source_chk)
  - una transferencia necesita las dos cuentas (tx_transfer_chk)
  - sin perdida de precision en montos grandes (BIGINT en centavos)

Requieren Postgres levantado con las migraciones aplicadas.
"""

import uuid

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncConnection


async def _seed(conn: AsyncConnection) -> dict[str, uuid.UUID]:
    """Inserta un usuario, dos cuentas y una categoria. Devuelve sus ids."""
    ids = {
        "user": uuid.uuid4(),
        "acc": uuid.uuid4(),
        "acc2": uuid.uuid4(),
        "cat": uuid.uuid4(),
    }
    await conn.execute(
        text(
            "INSERT INTO users (id, email, password_hash, display_name) "
            "VALUES (:id, :email, 'x', 'Test')"
        ),
        {"id": ids["user"], "email": f"{ids['user']}@test.local"},
    )
    for key in ("acc", "acc2"):
        await conn.execute(
            text(
                "INSERT INTO accounts (id, owner_id, name, type, currency) "
                "VALUES (:id, :owner, 'Caja', 'cash', 'ARS')"
            ),
            {"id": ids[key], "owner": ids["user"]},
        )
    await conn.execute(
        text(
            "INSERT INTO categories (id, owner_id, name, kind) "
            "VALUES (:id, :owner, 'Comida', 'expense')"
        ),
        {"id": ids["cat"], "owner": ids["user"]},
    )
    return ids


_TX_INSERT = text(
    "INSERT INTO transactions "
    "(id, owner_id, kind, status, occurred_at, amount, currency, source, "
    " account_id, transfer_account_id, category_id) "
    "VALUES (:id, :owner, :kind, :status, now(), :amount, 'ARS', :source, "
    " :account, :transfer, :category)"
)


async def test_valid_expense_inserts(conn: AsyncConnection) -> None:
    ids = await _seed(conn)
    tx = uuid.uuid4()
    await conn.execute(
        _TX_INSERT,
        {
            "id": tx,
            "owner": ids["user"],
            "kind": "expense",
            "status": "confirmed",
            "amount": 230272,
            "source": "manual",
            "account": ids["acc"],
            "transfer": None,
            "category": ids["cat"],
        },
    )
    got = (
        await conn.execute(text("SELECT amount FROM transactions WHERE id = :id"), {"id": tx})
    ).scalar_one()
    assert got == 230272


async def test_big_amount_keeps_precision(conn: AsyncConnection) -> None:
    # 90 billones de centavos: entra y sale identico, sin float de por medio.
    big = 9_000_000_000_000_000
    ids = await _seed(conn)
    tx = uuid.uuid4()
    await conn.execute(
        _TX_INSERT,
        {
            "id": tx,
            "owner": ids["user"],
            "kind": "income",
            "status": "confirmed",
            "amount": big,
            "source": "manual",
            "account": ids["acc"],
            "transfer": None,
            "category": ids["cat"],
        },
    )
    got = (
        await conn.execute(text("SELECT amount FROM transactions WHERE id = :id"), {"id": tx})
    ).scalar_one()
    assert got == big


async def test_negative_amount_rejected(conn: AsyncConnection) -> None:
    ids = await _seed(conn)
    with pytest.raises(IntegrityError):
        await conn.execute(
            _TX_INSERT,
            {
                "id": uuid.uuid4(),
                "owner": ids["user"],
                "kind": "expense",
                "status": "confirmed",
                "amount": -1,
                "source": "manual",
                "account": ids["acc"],
                "transfer": None,
                "category": ids["cat"],
            },
        )


async def test_manual_pending_rejected(conn: AsyncConnection) -> None:
    # 'pending' solo lo produce la ingesta automatica, nunca una carga manual.
    ids = await _seed(conn)
    with pytest.raises(IntegrityError):
        await conn.execute(
            _TX_INSERT,
            {
                "id": uuid.uuid4(),
                "owner": ids["user"],
                "kind": "expense",
                "status": "pending",
                "amount": 100,
                "source": "manual",
                "account": ids["acc"],
                "transfer": None,
                "category": ids["cat"],
            },
        )


async def test_transfer_without_second_account_rejected(conn: AsyncConnection) -> None:
    # Una transferencia necesita las dos puntas.
    ids = await _seed(conn)
    with pytest.raises(IntegrityError):
        await conn.execute(
            _TX_INSERT,
            {
                "id": uuid.uuid4(),
                "owner": ids["user"],
                "kind": "transfer",
                "status": "confirmed",
                "amount": 100,
                "source": "manual",
                "account": ids["acc"],
                "transfer": None,
                "category": None,
            },
        )
