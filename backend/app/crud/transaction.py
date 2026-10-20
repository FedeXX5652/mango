"""Transacciones: gasto, ingreso y transferencia sobre un solo modelo.

Toda la validacion de dominio (existencia, propiedad, coherencia por `kind`)
vive en `_validate_invariants`, que comparten alta y edicion. La base impone
las mismas reglas por CHECK; aca se validan antes para dar errores claros y para
lo que la base no puede (propiedad del recurso, kind de la categoria).

Fase 1: carga manual, siempre `status='confirmed'` y `source='manual'`. El
estado 'pending' solo lo produce la ingesta automatica (regla no negociable 4).
"""

import uuid
from datetime import datetime

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import DomainError
from app.crud import payer as pagadores
from app.crud._borrado import vivo
from app.crud.category import es_categoria_de_grupo
from app.crud.group import membresia
from app.models.account import Account, PaymentMethod
from app.models.category import Category
from app.models.transaction import Transaction
from app.models.user import GroupMember
from app.schemas.transaction import TransactionCreate, TransactionUpdate
from app.services import conversion

# Lo que quien pago puede tocar de su pago a confirmar (0032, G2): de que cuenta
# salio y su respuesta. El resto lo define quien cargo el gasto.
_DE_QUIEN_PAGO = {
    "status",
    "account_id",
    "amount_account",
    "exchange_rate",
    "payment_method_id",
    "notes",
}


async def _cuenta_accesible(
    session: AsyncSession, owner_id: uuid.UUID, account_id: uuid.UUID
) -> Account | None:
    """La cuenta si el usuario la puede usar: personal suya, o conjunta de un grupo
    del que es miembro (cuenta del grupo, ver 0016)."""
    stmt = select(Account).where(
        Account.id == account_id,
        Account.deleted_at.is_(None),
        or_(
            Account.owner_id == owner_id,
            Account.group_id.in_(
                select(GroupMember.group_id).where(
                    GroupMember.user_id == owner_id,
                    GroupMember.deleted_at.is_(None),
                )
            ),
        ),
    )
    return (await session.execute(stmt)).scalar_one_or_none()


async def _account_owned(session: AsyncSession, owner_id: uuid.UUID, account_id: uuid.UUID) -> bool:
    return (await _cuenta_accesible(session, owner_id, account_id)) is not None


async def _pm_owned(session: AsyncSession, owner_id: uuid.UUID, pm_id: uuid.UUID) -> bool:
    stmt = select(PaymentMethod.id).where(
        PaymentMethod.id == pm_id,
        PaymentMethod.owner_id == owner_id,
        PaymentMethod.deleted_at.is_(None),
    )
    return (await session.execute(stmt)).scalar_one_or_none() is not None


async def _moneda_de_cuenta(
    session: AsyncSession, owner_id: uuid.UUID, account_id: uuid.UUID
) -> str | None:
    cuenta = await _cuenta_accesible(session, owner_id, account_id)
    return cuenta.currency if cuenta else None


async def _cuenta_es_de_grupo(
    session: AsyncSession, owner_id: uuid.UUID, account_id: uuid.UUID | None
) -> bool:
    """¿El gasto se paga desde una cuenta conjunta? Marca `paid_from_group` para
    que no genere deuda entre personas (0016)."""
    if account_id is None:
        return False
    cuenta = await _cuenta_accesible(session, owner_id, account_id)
    return cuenta is not None and cuenta.group_id is not None


async def _completar_conversion(
    session: AsyncSession,
    owner_id: uuid.UUID,
    *,
    amount: int,
    currency: str,
    account_id: uuid.UUID,
    amount_account: int | None,
    exchange_rate,
) -> tuple[int | None, object]:
    """Deja `amount_account` y `exchange_rate` coherentes entre si y con la
    moneda de la cuenta debitada (ver services/conversion y 0005)."""
    moneda_cuenta = await _moneda_de_cuenta(session, owner_id, account_id)
    if moneda_cuenta is None:
        raise DomainError("La cuenta no existe")
    try:
        return conversion.completar(
            amount=amount,
            moneda=currency,
            moneda_cuenta=moneda_cuenta,
            amount_account=amount_account,
            exchange_rate=exchange_rate,
        )
    except ValueError as exc:
        raise DomainError(str(exc)) from exc


async def _category_kind(
    session: AsyncSession, owner_id: uuid.UUID, category_id: uuid.UUID
) -> str | None:
    # Categoria accesible: personal propia, o de un grupo del que soy miembro
    # (fase 3b, ver 0014). Un gasto compartido usa una categoria del grupo, que
    # tiene owner_id NULL: filtrar solo por owner_id la dejaria afuera.
    stmt = select(Category.kind).where(
        Category.id == category_id,
        Category.deleted_at.is_(None),
        or_(
            Category.owner_id == owner_id,
            Category.group_id.in_(
                select(GroupMember.group_id).where(
                    GroupMember.user_id == owner_id,
                    GroupMember.deleted_at.is_(None),
                )
            ),
        ),
    )
    return (await session.execute(stmt)).scalar_one_or_none()


async def _validate_invariants(
    session: AsyncSession,
    owner_id: uuid.UUID,
    *,
    kind: str,
    account_id: uuid.UUID | None,
    transfer_account_id: uuid.UUID | None,
    category_id: uuid.UUID | None,
    payment_method_id: uuid.UUID | None,
    sin_cuenta: bool = False,
) -> None:
    # Una transaccion confirmada siempre tiene cuenta (tx_confirmed_chk), salvo
    # un gasto compartido que pagaron otros enteros (0032).
    if account_id is None:
        if not sin_cuenta:
            raise DomainError("La cuenta es obligatoria")
    elif not await _account_owned(session, owner_id, account_id):
        raise DomainError("La cuenta no existe")

    if payment_method_id is not None and not await _pm_owned(session, owner_id, payment_method_id):
        raise DomainError("El medio de pago no existe")

    if kind == "transfer":
        if category_id is not None:
            raise DomainError("Una transferencia no lleva categoria")
        if transfer_account_id is None:
            raise DomainError("Una transferencia necesita la cuenta de destino")
        if transfer_account_id == account_id:
            raise DomainError("Las dos cuentas de la transferencia deben ser distintas")
        if not await _account_owned(session, owner_id, transfer_account_id):
            raise DomainError("La cuenta de destino no existe")
    else:  # expense / income
        if transfer_account_id is not None:
            raise DomainError("Solo una transferencia lleva cuenta de destino")
        if category_id is None:
            raise DomainError("La categoria es obligatoria en gasto e ingreso")
        cat_kind = await _category_kind(session, owner_id, category_id)
        if cat_kind is None:
            raise DomainError("La categoria no existe")
        if cat_kind != kind:
            raise DomainError(f"La categoria debe ser de tipo {kind}")


async def _validar_compartir(
    session: AsyncSession,
    owner_id: uuid.UUID,
    *,
    visibility: str,
    group_id: uuid.UUID | None,
    category_id: uuid.UUID | None,
) -> uuid.UUID | None:
    """Coherencia de compartir (fase 3b, ver 0014). Devuelve el group_id que hay
    que guardar (None si es privado).

    - `shared` exige un `group_id` de un grupo del que el usuario sea miembro:
      no se comparte a un grupo ajeno ni a la nada.
    - un gasto compartido se categoriza con una categoria **del grupo**, no una
      personal: si no, el reporte del grupo no agrega (Ana>Super vs Beto>Alacena).
    - `private` fuerza `group_id` NULL: un movimiento privado no cuelga de un
      grupo.
    """
    if visibility == "shared":
        if group_id is None:
            raise DomainError("Un movimiento compartido necesita un grupo")
        if await membresia(session, group_id, owner_id) is None:
            # 'no sos miembro' se trata como grupo inexistente: no se confirma
            # que el grupo exista.
            raise DomainError("El grupo no existe")
        if category_id is not None and not await es_categoria_de_grupo(
            session, category_id, group_id
        ):
            raise DomainError("Un movimiento compartido usa una categoria del grupo")
        return group_id
    return None


def _validar_lo_mio(
    kind: str, visibility: str, amount: int, amount_owner: int | None, conjunta: bool
) -> None:
    """`amount_owner` (0032): solo en un gasto compartido, y no mas que el total.
    Lo que puso la conjunta va como uno de los que pagaron, no como lo mio."""
    if amount_owner is None:
        return
    if kind != "expense" or visibility != "shared":
        raise DomainError("Lo que puso cada uno es de un gasto compartido")
    if amount_owner > amount:
        raise DomainError("Lo que pusiste no puede ser mas que el total")
    if conjunta:
        raise DomainError("Lo que puso la cuenta conjunta va entre los que pagaron")


async def create_transaction(
    session: AsyncSession,
    owner_id: uuid.UUID,
    data: TransactionCreate,
) -> Transaction:
    # `source` viene en el payload y solo puede ser 'manual' o 'recurring' (lo
    # acota el esquema). Nunca produce 'pending': eso es exclusivo de la ingesta
    # automatica (regla 4) y la base lo impone con tx_pending_source_chk.
    await _validate_invariants(
        session,
        owner_id,
        kind=data.kind,
        account_id=data.account_id,
        transfer_account_id=data.transfer_account_id,
        category_id=data.category_id,
        payment_method_id=data.payment_method_id,
        sin_cuenta=data.amount_owner == 0,
    )
    campos = data.model_dump()
    campos["group_id"] = await _validar_compartir(
        session,
        owner_id,
        visibility=data.visibility,
        group_id=data.group_id,
        category_id=data.category_id,
    )
    # Pagado desde una cuenta conjunta: plata del grupo, no genera deuda (0016).
    campos["paid_from_group"] = await _cuenta_es_de_grupo(session, owner_id, data.account_id)
    _validar_lo_mio(
        data.kind, data.visibility, data.amount, data.amount_owner, campos["paid_from_group"]
    )
    if data.account_id is None:
        campos["amount_account"], campos["exchange_rate"] = None, None
    else:
        # Lo que sale de la cuenta es lo que puso quien lo carga (0032).
        campos["amount_account"], campos["exchange_rate"] = await _completar_conversion(
            session,
            owner_id,
            amount=data.amount if data.amount_owner is None else data.amount_owner,
            currency=data.currency,
            account_id=data.account_id,
            amount_account=data.amount_account,
            exchange_rate=data.exchange_rate,
        )
    tx = Transaction(
        owner_id=owner_id,
        status="confirmed",
        **campos,
    )
    session.add(tx)
    await session.commit()
    await session.refresh(tx)
    return tx


async def get_transaction(
    session: AsyncSession, owner_id: uuid.UUID, tx_id: uuid.UUID, *, incluso_borrado: bool = False
) -> Transaction | None:
    stmt = select(Transaction).where(
        Transaction.id == tx_id,
        Transaction.owner_id == owner_id,
        vivo(Transaction, incluso_borrado),
    )
    return (await session.execute(stmt)).scalar_one_or_none()


async def list_transactions(
    session: AsyncSession,
    owner_id: uuid.UUID,
    *,
    account_id: uuid.UUID | None = None,
    category_id: uuid.UUID | None = None,
    kind: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    limit: int = 100,
    offset: int = 0,
) -> list[Transaction]:
    stmt = select(Transaction).where(
        Transaction.owner_id == owner_id,
        Transaction.deleted_at.is_(None),
    )
    if account_id is not None:
        # Incluye transferencias donde la cuenta es origen o destino.
        stmt = stmt.where(
            (Transaction.account_id == account_id) | (Transaction.transfer_account_id == account_id)
        )
    if category_id is not None:
        stmt = stmt.where(Transaction.category_id == category_id)
    if kind is not None:
        stmt = stmt.where(Transaction.kind == kind)
    if date_from is not None:
        stmt = stmt.where(Transaction.occurred_at >= date_from)
    if date_to is not None:
        stmt = stmt.where(Transaction.occurred_at < date_to)
    stmt = stmt.order_by(Transaction.occurred_at.desc()).limit(limit).offset(offset)
    return list((await session.execute(stmt)).scalars().all())


async def update_transaction(
    session: AsyncSession, owner_id: uuid.UUID, tx: Transaction, data: TransactionUpdate
) -> Transaction:
    values = data.model_dump(exclude_unset=True)
    estado_antes = tx.status

    # Valido sobre el resultado de aplicar los cambios (valor nuevo o el actual).
    def eff(field: str):
        return values.get(field, getattr(tx, field))

    # El pago de un miembro en un gasto que cargo otro (0032): solo elige la
    # cuenta y responde; el resto es del gasto.
    if tx.paid_for_id is not None:
        if set(values) - _DE_QUIEN_PAGO:
            raise DomainError("De tu parte de un gasto solo se elige la cuenta y si la pagaste")
        # 'pending' es solo deshacer un "no la pague" (0032). Desde confirmado,
        # le sacaria el debito a la cuenta y el balance lo seguiria contando.
        if values.get("status") == "pending" and estado_antes != "rejected":
            raise DomainError("Solo se puede deshacer un 'no la pagué'")
    elif values.get("status") in ("rejected", "pending"):
        raise DomainError("Solo se responde asi tu parte de un gasto que cargo otro")

    await _validate_invariants(
        session,
        owner_id,
        kind=eff("kind"),
        account_id=eff("account_id"),
        transfer_account_id=eff("transfer_account_id"),
        category_id=eff("category_id"),
        payment_method_id=eff("payment_method_id"),
        # Sin cuenta: lo pagaron otros enteros, o es un pago que no se confirmo.
        sin_cuenta=eff("amount_owner") == 0 or eff("status") != "confirmed",
    )

    # Compartir: si se toca la visibilidad o el grupo, se revalida y se fija el
    # group_id resultante (private -> NULL).
    if "visibility" in values or "group_id" in values:
        values["group_id"] = await _validar_compartir(
            session,
            owner_id,
            visibility=eff("visibility"),
            group_id=eff("group_id"),
            category_id=eff("category_id"),
        )

    # Si cambio la cuenta, se recalcula si el gasto sale de una cuenta conjunta.
    if "account_id" in values:
        values["paid_from_group"] = await _cuenta_es_de_grupo(session, owner_id, eff("account_id"))
    _validar_lo_mio(
        eff("kind"), eff("visibility"), eff("amount"), eff("amount_owner"), eff("paid_from_group")
    )
    if eff("visibility") != "shared" and await pagadores.tiene_pagadores(session, tx.id):
        raise DomainError("Lo pusieron entre varios: no puede dejar de ser compartido")

    # La conversion se recalcula si cambio cualquiera de sus insumos. Regla:
    # si vino `amount_account` manda el; si no y cambio el monto, se recalcula
    # la cotizacion sobre el monto debitado que ya estaba (es el dato del
    # banco, no se toca); si vino solo la cotizacion, se deduce el monto.
    toca_conversion = {
        "amount",
        "currency",
        "account_id",
        "amount_account",
        "exchange_rate",
        "amount_owner",
    } & set(values)
    if toca_conversion and eff("account_id") is None:
        values["amount_account"], values["exchange_rate"] = None, None
    elif toca_conversion:
        if "amount_account" in values:
            monto, rate = values["amount_account"], None
        elif "exchange_rate" in values:
            monto, rate = None, values["exchange_rate"]
        else:
            # Cambio el monto o la cuenta: se conserva lo debitado y se
            # recalcula la cotizacion.
            monto, rate = tx.amount_account, None
        values["amount_account"], values["exchange_rate"] = await _completar_conversion(
            session,
            owner_id,
            # Lo que sale de la cuenta es lo que puso quien lo carga (0032).
            amount=eff("amount") if eff("amount_owner") is None else eff("amount_owner"),
            currency=eff("currency"),
            account_id=eff("account_id"),
            amount_account=monto,
            exchange_rate=rate,
        )

    moneda_antes = tx.currency
    for field, value in values.items():
        setattr(tx, field, value)
    if tx.paid_for_id is not None and tx.status != estado_antes:
        await pagadores.responder(session, tx)
    elif {"occurred_at", "category_id", "payee", "currency"} & set(values):
        await pagadores.seguir_gasto(session, tx, otra_moneda=tx.currency != moneda_antes)
    await session.commit()
    await session.refresh(tx)
    return tx


async def soft_delete_transaction(session: AsyncSession, tx: Transaction) -> None:
    if tx.paid_for_id is not None:
        # Es la parte de un gasto que cargo otro: se responde, no se borra.
        raise DomainError("Es tu parte de un gasto: decí si la pagaste o no")
    tx.deleted_at = func.now()
    # Q2: con el gasto se van los que pagaron y sus pagos.
    await pagadores.borrar_del_gasto(session, tx)
    await session.commit()
