"""Exportacion de transacciones a CSV.

Los montos se guardan en centavos (enteros); aca se formatean a decimal con dos
lugares para que el archivo sea legible, con formateo entero exacto (nunca
float, decision 0002/5.2). Reusa el mismo filtrado que el listado.
"""

import csv
import io
import uuid
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud.transaction import list_transactions
from app.models.account import Account
from app.models.category import Category

_HEADER = [
    "fecha",
    "tipo",
    "monto",
    "moneda",
    "cuenta",
    "cuenta_destino",
    "categoria",
    "comercio",
    "notas",
    "estado",
]


def _format_amount(cents: int) -> str:
    # Magnitud positiva en centavos -> "2302.72". Formateo entero, sin float.
    return f"{cents // 100}.{cents % 100:02d}"


async def _name_map(session: AsyncSession, model, owner_id: uuid.UUID) -> dict[uuid.UUID, str]:
    # Incluye borrados: una transaccion vieja puede apuntar a algo ya archivado.
    rows = (
        await session.execute(select(model.id, model.name).where(model.owner_id == owner_id))
    ).all()
    return {row[0]: row[1] for row in rows}


async def transactions_csv(
    session: AsyncSession,
    owner_id: uuid.UUID,
    *,
    account_id: uuid.UUID | None = None,
    category_id: uuid.UUID | None = None,
    kind: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
) -> str:
    txs = await list_transactions(
        session,
        owner_id,
        account_id=account_id,
        category_id=category_id,
        kind=kind,
        date_from=date_from,
        date_to=date_to,
        limit=1_000_000,
    )
    accounts = await _name_map(session, Account, owner_id)
    categories = await _name_map(session, Category, owner_id)

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(_HEADER)
    for tx in txs:
        writer.writerow(
            [
                tx.occurred_at.isoformat(),
                tx.kind,
                _format_amount(tx.amount),
                tx.currency,
                accounts.get(tx.account_id, ""),
                accounts.get(tx.transfer_account_id, "") if tx.transfer_account_id else "",
                categories.get(tx.category_id, "") if tx.category_id else "",
                tx.payee or "",
                tx.notes or "",
                tx.status,
            ]
        )
    return buffer.getvalue()
