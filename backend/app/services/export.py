"""Exportacion de transacciones a CSV.

Los montos se guardan en centavos (enteros); aca se formatean a decimal con dos
lugares para que el archivo sea legible, con formateo entero exacto (nunca
float, decision 0002/5.2). Reusa el mismo filtrado que el listado.
"""

import csv
import io
import uuid
from datetime import datetime
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.crud.transaction import list_transactions
from app.models.account import Account
from app.models.category import Category

_HEADER = [
    # dd/mm/aaaa y HH:MM en la hora de Argentina, como en la app (1.7.0).
    "fecha",
    "hora",
    "tipo",
    "monto",
    "moneda",
    # Conversion cuando la moneda del movimiento no es la de la cuenta (0005).
    # Vacias cuando no hay conversion: no se rellena con el monto ni con 1.
    "monto_debitado",
    "cotizacion",
    "cuenta",
    "cuenta_destino",
    "categoria",
    "comercio",
    "notas",
    "estado",
]


def _format_amount(cents: int) -> str:
    # Centavos -> "2302.72". Formateo entero, sin float. Con el signo aparte: la
    # division entera de Python redondea hacia abajo, y -230272 daba -2303.28.
    # Hoy los montos son magnitudes (>= 0), pero el formato no depende de eso.
    signo = "-" if cents < 0 else ""
    entero, resto = divmod(abs(cents), 100)
    return f"{signo}{entero}.{resto:02d}"


def _fecha_y_hora(momento: datetime) -> tuple[str, str]:
    """La fecha y la hora en Argentina (1.7.0). Antes salia el ISO en UTC: un
    gasto de las 22:00 del 31 aparecia el 1 a la 01:00."""
    local = momento.astimezone(ZoneInfo(settings.tz))
    return local.strftime("%d/%m/%Y"), local.strftime("%H:%M")


async def _nombres(session: AsyncSession, model, ids: set[uuid.UUID]) -> dict[uuid.UUID, str]:
    """El nombre de cada cuenta o categoria que usan los movimientos. Por id y no
    por dueño: la categoria de un gasto compartido es del grupo y la cuenta
    conjunta no tiene dueño (antes salian vacias). Incluye borrados: un
    movimiento viejo puede apuntar a algo ya archivado."""
    if not ids:
        return {}
    rows = (await session.execute(select(model.id, model.name).where(model.id.in_(ids)))).all()
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
    accounts = await _nombres(
        session,
        Account,
        ({tx.account_id for tx in txs} | {tx.transfer_account_id for tx in txs}) - {None},
    )
    categories = await _nombres(session, Category, {tx.category_id for tx in txs} - {None})

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(_HEADER)
    for tx in txs:
        writer.writerow(
            [
                *_fecha_y_hora(tx.occurred_at),
                tx.kind,
                _format_amount(tx.amount),
                tx.currency,
                _format_amount(tx.amount_account) if tx.amount_account is not None else "",
                # La cotizacion sale como la guarda la base (hasta 10
                # decimales): es un dato, no un monto que haya que formatear.
                str(tx.exchange_rate) if tx.exchange_rate is not None else "",
                accounts.get(tx.account_id, ""),
                accounts.get(tx.transfer_account_id, "") if tx.transfer_account_id else "",
                categories.get(tx.category_id, "") if tx.category_id else "",
                tx.payee or "",
                tx.notes or "",
                tx.status,
            ]
        )
    return buffer.getvalue()
