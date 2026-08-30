"""Calculos de saldos y estadisticas. Solo lectura.

El monto se guarda como magnitud positiva; la direccion la aplica aca el
calculo, ramificando por `kind` (decision 0001). Todo es aritmetica entera en
centavos: nunca float. Solo cuenta lo `confirmed` y no borrado; los `pending`
(que produce la ingesta automatica) no afectan saldos hasta confirmarse (3.9).
"""

import uuid
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.account import Account
from app.models.transaction import Transaction

# Zona por defecto para agrupar por mes (una compra 23:50 del 31 cae en el mes
# correcto segun la zona del usuario, ver especificacion 8). Configurable por query.
DEFAULT_TZ = "America/Argentina/Buenos_Aires"


def _confirmed(stmt):
    return stmt.where(
        Transaction.status == "confirmed",
        Transaction.deleted_at.is_(None),
    )


async def _sum_by(
    session: AsyncSession, owner_id: uuid.UUID, kind: str, key_col
) -> dict[uuid.UUID, int]:
    stmt = _confirmed(
        select(key_col, func.coalesce(func.sum(Transaction.amount), 0)).where(
            Transaction.owner_id == owner_id,
            Transaction.kind == kind,
        )
    ).group_by(key_col)
    return {row[0]: int(row[1]) for row in (await session.execute(stmt)).all()}


async def account_balances(session: AsyncSession, owner_id: uuid.UUID) -> dict:
    """Saldo por cuenta = opening + ingresos - gastos + transferencias_entrantes
    - transferencias_salientes. Mas el patrimonio total por moneda."""
    accounts = list(
        (
            await session.execute(
                select(Account)
                .where(Account.owner_id == owner_id, Account.deleted_at.is_(None))
                .order_by(Account.sort_order, Account.created_at)
            )
        )
        .scalars()
        .all()
    )

    income = await _sum_by(session, owner_id, "income", Transaction.account_id)
    expense = await _sum_by(session, owner_id, "expense", Transaction.account_id)
    transfer_out = await _sum_by(session, owner_id, "transfer", Transaction.account_id)
    transfer_in = await _sum_by(session, owner_id, "transfer", Transaction.transfer_account_id)

    rows = []
    net_worth: dict[str, int] = {}
    for a in accounts:
        balance = (
            a.opening_balance
            + income.get(a.id, 0)
            - expense.get(a.id, 0)
            + transfer_in.get(a.id, 0)
            - transfer_out.get(a.id, 0)
        )
        rows.append(
            {
                "account_id": a.id,
                "name": a.name,
                "currency": a.currency,
                "balance": balance,
                "off_budget": a.off_budget,
                "archived": a.archived,
            }
        )
        # El patrimonio no cuenta las cuentas off_budget (plata de terceros).
        if not a.off_budget:
            net_worth[a.currency] = net_worth.get(a.currency, 0) + balance

    return {
        "accounts": rows,
        "net_worth": [{"currency": c, "total": t} for c, t in sorted(net_worth.items())],
    }


async def totals_by_category(
    session: AsyncSession,
    owner_id: uuid.UUID,
    *,
    kind: str = "expense",
    date_from: datetime | None = None,
    date_to: datetime | None = None,
) -> list[dict]:
    """Total gastado (o ingresado) por categoria y moneda, en un periodo."""
    stmt = _confirmed(
        select(
            Transaction.category_id,
            Transaction.currency,
            func.coalesce(func.sum(Transaction.amount), 0),
        ).where(
            Transaction.owner_id == owner_id,
            Transaction.kind == kind,
        )
    )
    if date_from is not None:
        stmt = stmt.where(Transaction.occurred_at >= date_from)
    if date_to is not None:
        stmt = stmt.where(Transaction.occurred_at < date_to)
    stmt = stmt.group_by(Transaction.category_id, Transaction.currency).order_by(
        func.sum(Transaction.amount).desc()
    )
    return [
        {"category_id": row[0], "currency": row[1], "total": int(row[2])}
        for row in (await session.execute(stmt)).all()
    ]


async def monthly_evolution(
    session: AsyncSession,
    owner_id: uuid.UUID,
    *,
    tz: str = DEFAULT_TZ,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
) -> list[dict]:
    """Ingresos, gastos y neto por mes y moneda. Las transferencias no cuentan:
    no cambian el patrimonio. El mes se corta en la zona horaria del usuario."""
    month = func.date_trunc("month", func.timezone(tz, Transaction.occurred_at)).label("month")
    income = func.coalesce(func.sum(Transaction.amount).filter(Transaction.kind == "income"), 0)
    expense = func.coalesce(func.sum(Transaction.amount).filter(Transaction.kind == "expense"), 0)

    stmt = _confirmed(
        select(month, Transaction.currency, income, expense).where(
            Transaction.owner_id == owner_id,
            Transaction.kind.in_(("income", "expense")),
        )
    )
    if date_from is not None:
        stmt = stmt.where(Transaction.occurred_at >= date_from)
    if date_to is not None:
        stmt = stmt.where(Transaction.occurred_at < date_to)
    stmt = stmt.group_by(month, Transaction.currency).order_by(month, Transaction.currency)

    result = []
    for row in (await session.execute(stmt)).all():
        month_value = row[0]
        inc, exp = int(row[2]), int(row[3])
        result.append(
            {
                "month": month_value.date() if isinstance(month_value, datetime) else month_value,
                "currency": row[1],
                "income": inc,
                "expense": exp,
                "net": inc - exp,
            }
        )
    return result
