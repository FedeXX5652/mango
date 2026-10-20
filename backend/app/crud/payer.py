"""Quien mas puso plata en un gasto compartido (1.8.0, ver 0032).

Las filas las carga **quien cargo el gasto**, como los splits. Por cada miembro
que puso plata el servidor le crea a esa persona un movimiento suyo (mismo id
que la fila), pendiente hasta que elige de que cuenta salio: como el cobro por
confirmar de 0018. La cuenta conjunta no confirma nada: es de todos.

Lo que pasa con ese movimiento lo maneja este modulo: se crea con la fila, toma
el monto nuevo y vuelve a pendiente si cambia (Q1), y se borra con la fila o con
el gasto (Q2). Cada cambio le avisa a esa persona.
"""

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import DomainError
from app.crud import notification as notif
from app.crud._borrado import vivo
from app.crud.group import membresia
from app.models.account import Account
from app.models.category import Category
from app.models.transaction import Transaction, TransactionPayer
from app.models.user import Group, User
from app.schemas.payer import PayerCreate, PayerUpdate

# El motivo del movimiento pendiente de quien pago (0032).
PAGO_A_CONFIRMAR = "pago_a_confirmar"


async def _gasto_compartido_propio(
    session: AsyncSession, owner_id: uuid.UUID, tx_id: uuid.UUID
) -> Transaction | None:
    stmt = select(Transaction).where(
        Transaction.id == tx_id,
        Transaction.owner_id == owner_id,
        Transaction.kind == "expense",
        Transaction.visibility == "shared",
        Transaction.group_id.isnot(None),
        Transaction.deleted_at.is_(None),
    )
    return (await session.execute(stmt)).scalar_one_or_none()


async def get_payer(
    session: AsyncSession,
    owner_id: uuid.UUID,
    payer_id: uuid.UUID,
    *,
    incluso_borrado: bool = False,
) -> TransactionPayer | None:
    """La fila si cuelga de un gasto que cargo el usuario."""
    stmt = (
        select(TransactionPayer)
        .join(Transaction, Transaction.id == TransactionPayer.transaction_id)
        .where(
            TransactionPayer.id == payer_id,
            vivo(TransactionPayer, incluso_borrado),
            Transaction.owner_id == owner_id,
        )
    )
    return (await session.execute(stmt)).scalar_one_or_none()


async def _textos(session: AsyncSession, tx: Transaction) -> tuple[str | None, str, str]:
    """(nombre del grupo, quien lo cargo, donde: comercio o categoria)."""
    grupo = await session.get(Group, tx.group_id)
    autor = await session.get(User, tx.owner_id)
    cat = await session.get(Category, tx.category_id) if tx.category_id else None
    donde = tx.payee or (cat.name if cat else "un gasto")
    return (
        grupo.name if grupo else None,
        autor.display_name if autor else "Alguien",
        donde,
    )


async def _avisar(
    session: AsyncSession,
    tx: Transaction,
    payer: TransactionPayer,
    tipo: str,
    titulo: str,
    cuerpo: str,
) -> None:
    grupo, _, _ = await _textos(session, tx)
    await notif.crear(
        session,
        user_id=payer.user_id,
        tipo=tipo,
        title=notif.de_grupo(grupo, titulo),
        body=cuerpo,
        link=f"/grupos/{tx.group_id}/movimientos/{tx.id}" if tipo != "pago_borrado" else "/",
        meta={"payer_id": str(payer.id), "transaction_id": str(tx.id)},
    )


async def create_payer(
    session: AsyncSession, owner_id: uuid.UUID, data: PayerCreate
) -> TransactionPayer:
    tx = await _gasto_compartido_propio(session, owner_id, data.transaction_id)
    if tx is None:
        raise DomainError("El gasto compartido no existe")
    if data.user_id is not None:
        if data.user_id == owner_id:
            raise DomainError("Lo que puso quien cargo el gasto va en el gasto, no aca")
        if await membresia(session, tx.group_id, data.user_id) is None:
            raise DomainError("Quien pago no es miembro del grupo")
    else:
        conjunta = await session.get(Account, data.account_id)
        if conjunta is None or conjunta.deleted_at is not None or conjunta.group_id != tx.group_id:
            raise DomainError("La cuenta no es la conjunta del grupo")

    payer = TransactionPayer(
        **data.model_dump(),
        # La conjunta es de todos: no hay nadie que confirme.
        status="pending" if data.user_id is not None else "confirmed",
    )
    session.add(payer)
    if data.user_id is not None:
        # El movimiento de quien pago, con el mismo id: pendiente y sin cuenta.
        session.add(
            Transaction(
                id=data.id,
                owner_id=data.user_id,
                kind="expense",
                status="pending",
                source="api",
                pending_reason=PAGO_A_CONFIRMAR,
                occurred_at=tx.occurred_at,
                amount=data.amount,
                currency=tx.currency,
                category_id=tx.category_id,
                payee=tx.payee,
                paid_for_id=tx.id,
            )
        )
        grupo, autor, donde = await _textos(session, tx)
        monto = notif.formatear_monto(data.amount, tx.currency)
        total = notif.formatear_monto(tx.amount, tx.currency)
        await _avisar(
            session,
            tx,
            payer,
            "pago_por_confirmar",
            "Pusiste en un gasto",
            f"{autor} cargó {total} en {donde}: pusiste {monto}. Confirmá de qué cuenta salió.",
        )
    await session.commit()
    await session.refresh(payer)
    return payer


async def _pago_de(session: AsyncSession, payer: TransactionPayer) -> Transaction | None:
    if payer.user_id is None:
        return None
    pago = await session.get(Transaction, payer.id)
    return pago if pago is not None and pago.deleted_at is None else None


async def update_payer(
    session: AsyncSession, payer: TransactionPayer, data: PayerUpdate
) -> TransactionPayer:
    if data.amount is None or data.amount == payer.amount:
        return payer
    payer.amount = data.amount
    tx = await session.get(Transaction, payer.transaction_id)
    pago = await _pago_de(session, payer)
    if pago is not None and tx is not None:
        # Q1: cambio lo que puso: se le vuelve a pedir que lo confirme.
        pago.amount = data.amount
        pago.amount_account = None
        pago.exchange_rate = None
        pago.status = "pending"
        payer.status = "pending"
        _, autor, donde = await _textos(session, tx)
        monto = notif.formatear_monto(data.amount, tx.currency)
        await _avisar(
            session,
            tx,
            payer,
            "pago_cambiado",
            "Cambió lo que pusiste",
            f"{autor} cambió lo que pusiste en {donde}: ahora {monto}. Confirmalo de nuevo.",
        )
    await session.commit()
    await session.refresh(payer)
    return payer


async def _borrar(
    session: AsyncSession, payer: TransactionPayer, tx: Transaction | None, motivo: str
) -> None:
    payer.deleted_at = func.now()
    pago = await _pago_de(session, payer)
    if pago is not None:
        # Q2: confirmado o no, el pago de un gasto que ya no lo incluye se va.
        pago.deleted_at = func.now()
        if tx is not None:
            _, autor, donde = await _textos(session, tx)
            await _avisar(
                session,
                tx,
                payer,
                "pago_borrado",
                "Se borró tu pago",
                motivo.format(autor=autor, donde=donde),
            )


async def soft_delete_payer(session: AsyncSession, payer: TransactionPayer) -> None:
    tx = await session.get(Transaction, payer.transaction_id)
    await _borrar(session, payer, tx, "{autor} sacó tu pago de {donde}.")
    await session.commit()


async def borrar_del_gasto(session: AsyncSession, tx: Transaction) -> None:
    """Se borro el gasto: se van todos los que pagaron y sus pagos (Q2). No hace
    commit: va en la transaccion del borrado."""
    payers = (
        (
            await session.execute(
                select(TransactionPayer).where(
                    TransactionPayer.transaction_id == tx.id,
                    TransactionPayer.deleted_at.is_(None),
                )
            )
        )
        .scalars()
        .all()
    )
    for p in payers:
        await _borrar(session, p, tx, "{autor} borró el gasto {donde}.")


async def seguir_gasto(
    session: AsyncSession, tx: Transaction, *, otra_moneda: bool = False
) -> None:
    """El gasto cambio de fecha, categoria, comercio o moneda: los pagos de los
    demas lo siguen. Con otra moneda, lo debitado de cada cuenta (y su
    cotizacion) era de la moneda vieja: el pago vuelve a pendiente y se le pide
    a esa persona que lo confirme de nuevo, como cuando cambia su monto (Q1). No
    hace commit."""
    pagos = (
        (
            await session.execute(
                select(Transaction).where(
                    Transaction.paid_for_id == tx.id, Transaction.deleted_at.is_(None)
                )
            )
        )
        .scalars()
        .all()
    )
    for p in pagos:
        p.occurred_at = tx.occurred_at
        p.category_id = tx.category_id
        p.payee = tx.payee
        p.currency = tx.currency
        if otra_moneda:
            p.amount_account = None
            p.exchange_rate = None
            p.status = "pending"
            payer = await session.get(TransactionPayer, p.id)
            if payer is not None and payer.deleted_at is None:
                payer.status = "pending"
                _, autor, donde = await _textos(session, tx)
                await _avisar(
                    session,
                    tx,
                    payer,
                    "pago_cambiado",
                    "Cambió la moneda del gasto",
                    f"{autor} cambió la moneda de {donde} a {tx.currency}. "
                    "Confirmá de nuevo lo que pusiste.",
                )


async def tiene_pagadores(session: AsyncSession, tx_id: uuid.UUID) -> bool:
    return (
        await session.execute(
            select(TransactionPayer.id)
            .where(TransactionPayer.transaction_id == tx_id, TransactionPayer.deleted_at.is_(None))
            .limit(1)
        )
    ).scalar_one_or_none() is not None


async def responder(session: AsyncSession, pago: Transaction) -> None:
    """Quien pago respondio (confirmo o rechazo): el estado se copia a su fila,
    que la ven todos. No hace commit."""
    payer = await session.get(TransactionPayer, pago.id)
    if payer is not None and payer.deleted_at is None:
        payer.status = pago.status
