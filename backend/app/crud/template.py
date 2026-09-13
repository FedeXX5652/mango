"""Plantillas: gastos frecuentes precargados que se materializan de un toque.

Aplicar una plantilla arma una transaccion con lo de la plantilla mas los
overrides, y la crea pasando por la misma validacion de dominio que la carga
manual (source='template').
"""

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.recurring import Template
from app.schemas.template import TemplateCreate, TemplateUpdate


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
