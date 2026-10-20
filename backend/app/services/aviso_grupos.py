"""Avisos del grupo que arma el planificador (1.7.0, ver 0019).

- `gasto_compartido`: alguien cargo un gasto del grupo en el que tenes parte. No
  sale en el alta: el movimiento sube por la cola de sync antes que sus partes
  (otros pedidos), y recien con las partes se sabe a quien le toca algo. Esta
  tarea lo arma `ESPERA` despues de que llego el movimiento.
- `presupuesto_excedido`: lo gastado este mes en una categoria del grupo paso su
  tope. Una vez por tope (el tope es de un mes), a todos los miembros.
- `pago_rechazado` (1.8.0, 0032): quien pago dijo que no pago su parte. Sale
  `GRACIA` despues y solo si sigue rechazado: deshacer en ese rato no avisa.

Lo que ya se aviso se reconoce por el `meta` del aviso: la tarea puede pasar de
nuevo por lo mismo y no repite.
"""

import uuid
from collections import defaultdict
from datetime import UTC, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import BigInteger, String, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.crud import notification as notif
from app.models.budget import Budget
from app.models.category import Category
from app.models.transaction import Transaction, TransactionPayer, TransactionSplit
from app.models.user import Group, GroupMember, Notification, User

# Lo que se le da al resto del gasto (sus partes) para llegar despues del
# movimiento: suben en la misma tanda, a segundos.
ESPERA = timedelta(minutes=1)
# Hasta donde se mira para atras: cubre un reinicio del backend. Un gasto que
# llego antes ya no es nuevo y no avisa.
VENTANA = timedelta(hours=1)
# Lo que se espera antes de avisar un "no la pague": el rato para deshacerlo.
GRACIA = timedelta(seconds=30)


async def _miembros(
    session: AsyncSession, grupos: set[uuid.UUID]
) -> dict[uuid.UUID, set[uuid.UUID]]:
    miembros: dict[uuid.UUID, set[uuid.UUID]] = defaultdict(set)
    for gid, uid in (
        await session.execute(
            select(GroupMember.group_id, GroupMember.user_id).where(
                GroupMember.group_id.in_(grupos), GroupMember.deleted_at.is_(None)
            )
        )
    ).all():
        miembros[gid].add(uid)
    return miembros


async def _nombres(session: AsyncSession, modelo, ids: set[uuid.UUID]) -> dict[uuid.UUID, str]:
    columna = modelo.display_name if modelo is User else modelo.name
    return dict((await session.execute(select(modelo.id, columna).where(modelo.id.in_(ids)))).all())


async def gastos_compartidos(session: AsyncSession, ahora: datetime) -> int:
    """Avisa a cada miembro con parte en un gasto compartido nuevo, salvo a quien
    lo cargo. Sin partes guardadas el gasto es en partes iguales entre todos
    (0015): le toca a cada miembro."""
    gastos = (
        (
            await session.execute(
                select(Transaction).where(
                    Transaction.visibility == "shared",
                    Transaction.kind == "expense",
                    Transaction.group_id.isnot(None),
                    Transaction.status == "confirmed",
                    Transaction.deleted_at.is_(None),
                    Transaction.created_at <= ahora - ESPERA,
                    Transaction.created_at > ahora - VENTANA,
                )
            )
        )
        .scalars()
        .all()
    )
    if not gastos:
        return 0
    ids = [t.id for t in gastos]
    partes: dict[uuid.UUID, dict[uuid.UUID, int]] = defaultdict(dict)
    for tx_id, uid, monto in (
        await session.execute(
            select(
                TransactionSplit.transaction_id, TransactionSplit.user_id, TransactionSplit.amount
            ).where(
                TransactionSplit.transaction_id.in_(ids),
                TransactionSplit.user_id.isnot(None),
                TransactionSplit.deleted_at.is_(None),
            )
        )
    ).all():
        partes[tx_id][uid] = partes[tx_id].get(uid, 0) + monto
    de_que_gasto = Notification.meta["transaction_id"].astext
    avisados = set(
        (
            await session.execute(
                select(Notification.user_id, de_que_gasto).where(
                    Notification.type == "gasto_compartido",
                    de_que_gasto.in_([str(i) for i in ids]),
                )
            )
        ).all()
    )
    # Los que pusieron plata ya recibieron "Pusiste en un gasto" (0032).
    pusieron = set(
        (
            await session.execute(
                select(TransactionPayer.user_id, TransactionPayer.transaction_id).where(
                    TransactionPayer.transaction_id.in_(ids),
                    TransactionPayer.user_id.isnot(None),
                    TransactionPayer.deleted_at.is_(None),
                )
            )
        ).all()
    )
    grupos = {t.group_id for t in gastos}
    miembros = await _miembros(session, grupos)
    nombres_grupo = await _nombres(session, Group, grupos)
    autores = await _nombres(session, User, {t.owner_id for t in gastos})
    categorias = await _nombres(session, Category, {t.category_id for t in gastos if t.category_id})

    creados = 0
    for t in gastos:
        reparto = partes.get(t.id)
        con_parte = (
            {uid for uid, monto in reparto.items() if monto > 0}
            if reparto
            else miembros[t.group_id]
        )
        donde = t.payee or categorias.get(t.category_id)
        monto = notif.formatear_monto(t.amount, t.currency)
        texto = f"{autores.get(t.owner_id, 'Alguien')} cargó {monto}"
        if donde:
            texto += f" en {donde}"
        for uid in sorted((con_parte & miembros[t.group_id]) - {t.owner_id}):
            if (uid, str(t.id)) in avisados or (uid, t.id) in pusieron:
                continue
            if t.paid_from_group:
                detalle = "Lo pagó la cuenta conjunta."
            elif reparto:
                detalle = f"Te toca {notif.formatear_monto(reparto[uid], t.currency)}."
            else:
                detalle = "Se reparte en partes iguales."
            await notif.crear(
                session,
                user_id=uid,
                tipo="gasto_compartido",
                title=notif.de_grupo(nombres_grupo.get(t.group_id), "Gasto nuevo"),
                body=f"{texto}. {detalle}",
                link=f"/grupos/{t.group_id}/movimientos/{t.id}",
                meta={"transaction_id": str(t.id)},
            )
            creados += 1
    return creados


def _mes(ahora: datetime) -> tuple[datetime, datetime]:
    """El mes en curso, en la hora de Argentina: desde el dia 1 a las 00:00 hasta
    el 1 del siguiente."""
    zona = ZoneInfo(settings.tz)
    primero = ahora.astimezone(zona).date().replace(day=1)
    siguiente = (primero + timedelta(days=32)).replace(day=1)
    return datetime.combine(primero, time(), zona), datetime.combine(siguiente, time(), zona)


async def topes_excedidos(session: AsyncSession, ahora: datetime) -> int:
    """Avisa a todos los miembros cuando lo gastado este mes en una categoria del
    grupo pasa su tope. Cuenta como la pantalla del presupuesto del grupo: los
    gastos compartidos de esa categoria, en la moneda del tope (0005)."""
    desde, hasta = _mes(ahora)
    # SUM de BIGINT da NUMERIC en Postgres: se vuelve a entero (regla 1).
    gastado = (
        select(cast(func.coalesce(func.sum(Transaction.amount), 0), BigInteger))
        .where(
            Transaction.group_id == Budget.group_id,
            Transaction.category_id == Budget.category_id,
            Transaction.currency == Budget.currency,
            Transaction.visibility == "shared",
            Transaction.kind == "expense",
            Transaction.deleted_at.is_(None),
            Transaction.occurred_at >= desde,
            Transaction.occurred_at < hasta,
        )
        .correlate(Budget)
        .scalar_subquery()
    )
    ya_avisado = (
        select(Notification.id)
        .where(
            Notification.type == "presupuesto_excedido",
            Notification.meta["budget_id"].astext == cast(Budget.id, String),
        )
        .exists()
    )
    filas = (
        await session.execute(
            select(Budget, gastado, Group.name, Category.name)
            .join(Group, Group.id == Budget.group_id)
            .join(Category, Category.id == Budget.category_id)
            .where(
                Budget.group_id.isnot(None),
                Budget.period_start == desde.date(),
                Budget.deleted_at.is_(None),
                Budget.amount > 0,
                Group.deleted_at.is_(None),
                gastado > Budget.amount,
                ~ya_avisado,
            )
        )
    ).all()
    if not filas:
        return 0
    miembros = await _miembros(session, {b.group_id for b, *_ in filas})
    creados = 0
    for b, total, grupo, categoria in filas:
        cuanto = (
            f"Llevan {notif.formatear_monto(total, b.currency)} "
            f"de {notif.formatear_monto(b.amount, b.currency)} este mes."
        )
        for uid in sorted(miembros[b.group_id]):
            await notif.crear(
                session,
                user_id=uid,
                tipo="presupuesto_excedido",
                title=notif.de_grupo(grupo, f"Se pasaron del tope en {categoria}"),
                body=cuanto,
                link=f"/grupos/{b.group_id}/presupuesto",
                meta={"budget_id": str(b.id)},
            )
            creados += 1
    return creados


async def pagos_rechazados(session: AsyncSession, ahora: datetime) -> int:
    """Le avisa a quien cargo el gasto que alguien dijo que no puso su parte.
    Uno por rechazo: si lo deshace y vuelve a rechazar, es otro (`desde`)."""
    filas = (
        await session.execute(
            select(TransactionPayer, Transaction)
            .join(Transaction, Transaction.id == TransactionPayer.transaction_id)
            .where(
                TransactionPayer.status == "rejected",
                TransactionPayer.user_id.isnot(None),
                TransactionPayer.deleted_at.is_(None),
                TransactionPayer.updated_at <= ahora - GRACIA,
                TransactionPayer.updated_at > ahora - VENTANA,
                Transaction.deleted_at.is_(None),
            )
        )
    ).all()
    if not filas:
        return 0
    de_cual = Notification.meta["payer_id"].astext
    ya = set(
        (
            await session.execute(
                select(de_cual, Notification.meta["desde"].astext).where(
                    Notification.type == "pago_rechazado",
                    de_cual.in_([str(p.id) for p, _ in filas]),
                )
            )
        ).all()
    )
    nombres = await _nombres(session, User, {p.user_id for p, _ in filas})
    grupos = await _nombres(session, Group, {t.group_id for _, t in filas})
    categorias = await _nombres(
        session, Category, {t.category_id for _, t in filas if t.category_id}
    )
    creados = 0
    for p, t in filas:
        desde = p.updated_at.isoformat()
        if (str(p.id), desde) in ya:
            continue
        quien = nombres.get(p.user_id, "Alguien")
        donde = t.payee or categorias.get(t.category_id) or "un gasto"
        await notif.crear(
            session,
            user_id=t.owner_id,
            tipo="pago_rechazado",
            title=notif.de_grupo(grupos.get(t.group_id), f"{quien} dice que no pagó"),
            body=(
                f"{quien} dice que no puso {notif.formatear_monto(p.amount, t.currency)} "
                f"en {donde}. Revisá el gasto."
            ),
            link=f"/grupos/{t.group_id}/movimientos/{t.id}",
            meta={"payer_id": str(p.id), "desde": desde, "transaction_id": str(t.id)},
        )
        creados += 1
    return creados


async def avisar(session: AsyncSession, ahora: datetime | None = None) -> int:
    """La tarea del planificador. Devuelve cuantos avisos creo."""
    ahora = ahora or datetime.now(UTC)
    creados = (
        await gastos_compartidos(session, ahora)
        + await topes_excedidos(session, ahora)
        + await pagos_rechazados(session, ahora)
    )
    await session.commit()
    return creados
