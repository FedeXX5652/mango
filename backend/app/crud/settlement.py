"""Pagos entre miembros para saldar deudas del grupo (fase 3b.3, ver 0015).

No mueve plata de ninguna cuenta: registra que la deuda se salda por fuera. Lo
puede cargar y deshacer cualquier miembro (como la taxonomia del grupo, 0014).
"""

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import DomainError
from app.crud import notification as notif
from app.crud.group import membresia
from app.models.account import Account, PaymentMethod
from app.models.transaction import Transaction
from app.models.user import Settlement, User
from app.schemas.settlement import SettlementCreate


async def create_settlement(
    session: AsyncSession, creador_id: uuid.UUID, data: SettlementCreate
) -> Settlement:
    if data.from_user_id == data.to_user_id:
        raise DomainError("El pago tiene que ser entre dos personas distintas")
    # Quien lo registra tiene que ser del grupo (si no, ni sabe que existe).
    if await membresia(session, data.group_id, creador_id) is None:
        raise DomainError("El grupo no existe")
    # Las dos puntas del pago tienen que ser miembros.
    if await membresia(session, data.group_id, data.from_user_id) is None:
        raise DomainError("Quien paga no es miembro del grupo")
    if await membresia(session, data.group_id, data.to_user_id) is None:
        raise DomainError("Quien cobra no es miembro del grupo")

    # Pago REAL: la cuenta y el medio son del que paga (sale de SU bolsillo). No
    # se puede mover plata de la cuenta de otro. La cuenta conjunta no cuenta:
    # saldar es entre personas (0017).
    if data.account_id is not None:
        cuenta = (
            await session.execute(
                select(Account).where(
                    Account.id == data.account_id,
                    Account.owner_id == data.from_user_id,
                    Account.deleted_at.is_(None),
                )
            )
        ).scalar_one_or_none()
        if cuenta is None:
            raise DomainError("La cuenta no es del que paga")
    if data.payment_method_id is not None:
        pm = (
            await session.execute(
                select(PaymentMethod.id).where(
                    PaymentMethod.id == data.payment_method_id,
                    PaymentMethod.owner_id == data.from_user_id,
                    PaymentMethod.deleted_at.is_(None),
                )
            )
        ).scalar_one_or_none()
        if pm is None:
            raise DomainError("El medio de pago no es del que paga")

    pago = Settlement(created_by=creador_id, **data.model_dump())
    session.add(pago)
    await session.flush()

    # Pago REAL: se le anota al acreedor un INGRESO pendiente por confirmar (0018).
    # Lo crea el servidor (id propio): el acreedor no lo cargo. Queda 'pending' con
    # source='api' (nunca 'manual', regla 4) hasta que le asigne cuenta y confirme.
    if data.account_id is not None:
        quien = await session.get(User, data.from_user_id)
        nombre = quien.display_name if quien else "otro miembro"
        session.add(
            Transaction(
                id=uuid.uuid4(),
                owner_id=data.to_user_id,
                kind="income",
                status="pending",
                source="api",
                occurred_at=data.occurred_at,
                amount=data.amount,
                currency=data.currency,
                payee=f"Pago de {nombre}",
                settlement_id=pago.id,
                pending_reason="cobro_a_confirmar",
            )
        )
        # Aviso al acreedor: te llego un pago, confirma la cuenta (0019).
        monto = notif.formatear_monto(data.amount, data.currency)
        await notif.crear(
            session,
            user_id=data.to_user_id,
            tipo="pago_recibido",
            title="Te registraron un pago",
            body=f"{nombre} registró un pago de {monto}. Confirmá a qué cuenta entró.",
            link="/",
        )

    await session.commit()
    await session.refresh(pago)
    return pago


async def get_settlement(
    session: AsyncSession, user_id: uuid.UUID, settlement_id: uuid.UUID
) -> Settlement | None:
    """El pago si el usuario es miembro de su grupo (cualquiera lo puede deshacer)."""
    pago = (
        await session.execute(
            select(Settlement).where(
                Settlement.id == settlement_id, Settlement.deleted_at.is_(None)
            )
        )
    ).scalar_one_or_none()
    if pago is None:
        return None
    if await membresia(session, pago.group_id, user_id) is None:
        return None
    return pago


async def soft_delete_settlement(session: AsyncSession, pago: Settlement) -> None:
    pago.deleted_at = func.now()
    # El cobro del acreedor se borra SOLO si sigue pendiente: si ya lo confirmo
    # (le asigno cuenta), la plata ya la dio por recibida y queda (0018).
    cobro = (
        await session.execute(
            select(Transaction).where(
                Transaction.settlement_id == pago.id,
                Transaction.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if cobro is not None and cobro.status == "pending":
        cobro.deleted_at = func.now()
    elif cobro is not None:
        # Ya estaba confirmado: queda, pero se avisa (la deuda "vuelve", 0019).
        quien = await session.get(User, pago.from_user_id)
        nombre = quien.display_name if quien else "otro miembro"
        monto = notif.formatear_monto(pago.amount, pago.currency)
        await notif.crear(
            session,
            user_id=pago.to_user_id,
            tipo="pago_deshecho",
            title="Se deshizo un pago",
            body=f"{nombre} deshizo un pago de {monto} que ya habías confirmado. "
            "El cobro quedó en tu cuenta; revisalo si corresponde.",
            link="/",
        )
    await session.commit()
