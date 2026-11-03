"""Reglas recurrentes: sueldo, alquiler, servicios. Alta, edicion y baja.

**Generarlas no se hace aca.** La cuenta de que ocurrencia vencio y la creacion
del movimiento viven en el dispositivo (`lib/recurrentes` en el cliente), porque
si dependieran del servidor tu alquiler no existiria hasta que te reconectes.
El servidor solo recibe la regla y los movimientos que la regla produjo, como
cualquier otra escritura.

Una regla de un grupo (1.15.0) es un gasto con categoria del grupo que paga
siempre quien la creo, con su cuenta o con la conjunta del grupo; la generan
solo sus dispositivos. La ven todos los miembros, pero la edita o borra solo
quien la creo: usa una cuenta suya que los demas no ven.
"""

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import DomainError
from app.crud._borrado import vivo
from app.crud.category import es_categoria_de_grupo
from app.crud.group import membresia
from app.crud.transaction import _cuenta_accesible, _validate_invariants
from app.models.category import Category
from app.models.recurring import RecurringRule
from app.schemas.recurring import RecurringCreate, RecurringUpdate


async def _validar_ambito(
    session: AsyncSession, owner_id: uuid.UUID, data: RecurringCreate
) -> None:
    """Lo que `_validate_invariants` no mira: que la categoria y la cuenta sean
    del espacio de la regla (0014). Si no, la regla generaria movimientos que el
    servidor rechaza."""
    cuenta = await _cuenta_accesible(session, owner_id, data.account_id)
    if data.group_id is None:
        if data.category_id is not None:
            grupo_cat = await session.scalar(
                select(Category.group_id).where(Category.id == data.category_id)
            )
            if grupo_cat is not None:
                raise DomainError("Una recurrente personal no lleva una categoría del grupo")
        return
    if await membresia(session, data.group_id, owner_id) is None:
        raise DomainError("El grupo no existe")
    if data.kind != "expense":
        raise DomainError("Las recurrentes de un grupo son de gastos")
    if data.category_id is None or not await es_categoria_de_grupo(
        session, data.category_id, data.group_id
    ):
        raise DomainError("La categoría no es del grupo")
    # Una cuenta mia o la conjunta de ESTE grupo, no la de otro.
    if cuenta is not None and cuenta.group_id not in (None, data.group_id):
        raise DomainError("La cuenta no existe")


async def create_recurring(
    session: AsyncSession, owner_id: uuid.UUID, data: RecurringCreate
) -> RecurringRule:
    # Rechaza de entrada una regla que generaria transacciones invalidas.
    await _validate_invariants(
        session,
        owner_id,
        kind=data.kind,
        account_id=data.account_id,
        transfer_account_id=data.transfer_account_id,
        category_id=data.category_id,
        payment_method_id=data.payment_method_id,
    )
    await _validar_ambito(session, owner_id, data)
    rule = RecurringRule(owner_id=owner_id, **data.model_dump())
    session.add(rule)
    await session.commit()
    await session.refresh(rule)
    return rule


async def get_recurring(
    session: AsyncSession, owner_id: uuid.UUID, rule_id: uuid.UUID, *, incluso_borrado: bool = False
) -> RecurringRule | None:
    stmt = select(RecurringRule).where(
        RecurringRule.id == rule_id,
        RecurringRule.owner_id == owner_id,
        vivo(RecurringRule, incluso_borrado),
    )
    return (await session.execute(stmt)).scalar_one_or_none()


async def update_recurring(
    session: AsyncSession, rule: RecurringRule, data: RecurringUpdate
) -> RecurringRule:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(rule, field, value)
    await session.commit()
    await session.refresh(rule)
    return rule


async def soft_delete_recurring(session: AsyncSession, rule: RecurringRule) -> None:
    rule.deleted_at = func.now()
    await session.commit()
