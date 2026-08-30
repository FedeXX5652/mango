"""Plantillas: gastos frecuentes precargados que se materializan de un toque.

Aplicar una plantilla arma una transaccion con lo de la plantilla mas los
overrides, y la crea pasando por la misma validacion de dominio que la carga
manual (source='template').
"""

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import DomainError
from app.crud.transaction import create_transaction
from app.models.recurring import Template
from app.models.transaction import Transaction
from app.schemas.template import TemplateApply, TemplateCreate, TemplateUpdate
from app.schemas.transaction import TransactionCreate


async def create_template(
    session: AsyncSession, owner_id: uuid.UUID, data: TemplateCreate
) -> Template:
    template = Template(owner_id=owner_id, **data.model_dump())
    session.add(template)
    await session.commit()
    await session.refresh(template)
    return template


async def get_template(
    session: AsyncSession, owner_id: uuid.UUID, template_id: uuid.UUID
) -> Template | None:
    stmt = select(Template).where(
        Template.id == template_id,
        Template.owner_id == owner_id,
        Template.deleted_at.is_(None),
    )
    return (await session.execute(stmt)).scalar_one_or_none()


async def list_templates(session: AsyncSession, owner_id: uuid.UUID) -> list[Template]:
    stmt = (
        select(Template)
        .where(Template.owner_id == owner_id, Template.deleted_at.is_(None))
        .order_by(Template.sort_order, Template.name)
    )
    return list((await session.execute(stmt)).scalars().all())


async def update_template(
    session: AsyncSession, template: Template, data: TemplateUpdate
) -> Template:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(template, field, value)
    await session.commit()
    await session.refresh(template)
    return template


async def soft_delete_template(session: AsyncSession, template: Template) -> None:
    template.deleted_at = func.now()
    await session.commit()


async def apply_template(
    session: AsyncSession, owner_id: uuid.UUID, template: Template, data: TemplateApply
) -> Transaction:
    # Merge: override si vino, sino lo de la plantilla.
    amount = data.amount if data.amount is not None else template.amount
    currency = data.currency or template.currency
    account_id = data.account_id or template.account_id

    if amount is None:
        raise DomainError("Falta el monto para aplicar la plantilla")
    if currency is None:
        raise DomainError("Falta la moneda para aplicar la plantilla")
    if account_id is None:
        raise DomainError("Falta la cuenta para aplicar la plantilla")

    tx_data = TransactionCreate(
        id=data.id,
        kind=template.kind,
        occurred_at=data.occurred_at,
        amount=amount,
        currency=currency,
        account_id=account_id,
        transfer_account_id=data.transfer_account_id,
        category_id=data.category_id or template.category_id,
        payment_method_id=data.payment_method_id or template.payment_method_id,
        payee=data.payee or template.payee,
        notes=data.notes or template.notes,
    )
    return await create_transaction(session, owner_id, tx_data, source="template")
