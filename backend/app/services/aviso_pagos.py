"""El boton del aviso de un pago a confirmar (1.8.0, ver 0032).

"Pagada con Efectivo": confirma lo que puse en un gasto que cargo otro con la
ultima cuenta con la que pague algo, sin abrir la app. Es el unico boton: "No la
pague" no va en el aviso (se toca de casualidad); se responde en la app. Como
los botones de los recordatorios (0030), lo autoriza un permiso de un solo uso
que viaja en el aviso: el service worker no tiene la sesion.

Si la cuenta esta en otra moneda que el gasto no se puede confirmar sin el monto
debitado: no hay boton y el aviso abre la app.
"""

import hashlib
import secrets
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud import payer as crud_payer
from app.models.account import Account
from app.models.transaction import PaymentActionToken, Transaction
from app.models.user import Notification

TIPOS = {"pago_por_confirmar", "pago_cambiado"}
DURACION_PERMISO = timedelta(days=7)
RUTA = "/api/v1/payment-actions"


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


async def _ultima_cuenta(session: AsyncSession, user_id: uuid.UUID, moneda: str) -> Account | None:
    """La ultima cuenta personal, en esa moneda, con la que la persona pago algo."""
    stmt = (
        select(Account)
        .join(Transaction, Transaction.account_id == Account.id)
        .where(
            Transaction.owner_id == user_id,
            Transaction.kind == "expense",
            Transaction.status == "confirmed",
            Transaction.deleted_at.is_(None),
            Account.owner_id == user_id,
            Account.currency == moneda,
            Account.archived.is_(False),
            Account.deleted_at.is_(None),
        )
        .order_by(Transaction.occurred_at.desc())
        .limit(1)
    )
    return (await session.execute(stmt)).scalar_one_or_none()


async def acciones_de(session: AsyncSession, aviso: Notification) -> dict:
    """El boton y su permiso, si el aviso es de un pago a confirmar que sigue
    pendiente. Si no, nada."""
    meta = aviso.meta or {}
    if aviso.type not in TIPOS or "payer_id" not in meta:
        return {}
    pago = await session.get(Transaction, uuid.UUID(meta["payer_id"]))
    if pago is None or pago.deleted_at is not None or pago.status != "pending":
        return {}
    cuenta = await _ultima_cuenta(session, aviso.user_id, pago.currency)
    if cuenta is None:
        return {}
    token = secrets.token_urlsafe(32)
    session.add(
        PaymentActionToken(
            id=uuid.uuid4(),
            token_hash=_hash(token),
            user_id=aviso.user_id,
            transaction_id=pago.id,
            account_id=cuenta.id,
            expires_at=datetime.now(UTC) + DURACION_PERMISO,
        )
    )
    return {
        "acciones": [{"accion": "pagado", "titulo": f"Pagada con {cuenta.name}"}],
        "token": token,
        "accion_url": RUTA,
    }


async def usar_permiso(session: AsyncSession, token: str, accion: str) -> bool:
    """Confirma el pago con la cuenta del permiso. False si el permiso no sirve
    (no existe, ya se uso o vencio): el service worker abre la app."""
    fila = (
        await session.execute(
            select(PaymentActionToken)
            .where(PaymentActionToken.token_hash == _hash(token))
            .with_for_update()
        )
    ).scalar_one_or_none()
    ahora = datetime.now(UTC)
    if fila is None or fila.used_at is not None or fila.expires_at < ahora or accion != "pagado":
        return False
    fila.used_at = ahora
    pago = await session.get(Transaction, fila.transaction_id)
    # Un aviso viejo no pisa lo que se respondio en la app (o lo que cambio quien
    # cargo el gasto): solo confirma un pago que sigue pendiente.
    if pago is not None and pago.deleted_at is None and pago.status == "pending":
        pago.account_id = fila.account_id
        pago.amount_account = None
        pago.exchange_rate = None
        pago.status = "confirmed"
        await crud_payer.responder(session, pago)
    await session.commit()
    return True
