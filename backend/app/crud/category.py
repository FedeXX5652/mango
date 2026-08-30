"""Operaciones de base para categorias. Impone en la app dos reglas que la
base no fuerza: jerarquia de solo dos niveles, y que la subcategoria comparta
el kind de su padre.
"""

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import DomainError
from app.models.category import Category
from app.schemas.category import CategoryCreate, CategoryUpdate


async def _get_owned(
    session: AsyncSession, owner_id: uuid.UUID, category_id: uuid.UUID
) -> Category | None:
    stmt = select(Category).where(
        Category.id == category_id,
        Category.owner_id == owner_id,
        Category.deleted_at.is_(None),
    )
    return (await session.execute(stmt)).scalar_one_or_none()


async def create_category(
    session: AsyncSession, owner_id: uuid.UUID, data: CategoryCreate
) -> Category:
    if data.parent_id is not None:
        parent = await _get_owned(session, owner_id, data.parent_id)
        if parent is None:
            raise DomainError("La categoria padre no existe")
        if parent.parent_id is not None:
            raise DomainError("Solo se permiten dos niveles de categoria")
        if parent.kind != data.kind:
            raise DomainError("La subcategoria debe tener el mismo kind que el padre")

    category = Category(owner_id=owner_id, **data.model_dump())
    session.add(category)
    await session.commit()
    await session.refresh(category)
    return category


async def get_category(
    session: AsyncSession, owner_id: uuid.UUID, category_id: uuid.UUID
) -> Category | None:
    return await _get_owned(session, owner_id, category_id)


async def list_categories(
    session: AsyncSession, owner_id: uuid.UUID, *, include_archived: bool = False
) -> list[Category]:
    stmt = select(Category).where(
        Category.owner_id == owner_id,
        Category.deleted_at.is_(None),
    )
    if not include_archived:
        stmt = stmt.where(Category.archived.is_(False))
    # Padres antes que hijas (parent_id NULL primero), luego por orden y nombre.
    stmt = stmt.order_by(Category.parent_id.nulls_first(), Category.sort_order, Category.name)
    return list((await session.execute(stmt)).scalars().all())


async def update_category(
    session: AsyncSession, category: Category, data: CategoryUpdate
) -> Category:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(category, field, value)
    await session.commit()
    await session.refresh(category)
    return category


async def soft_delete_category(session: AsyncSession, category: Category) -> None:
    category.deleted_at = func.now()
    await session.commit()
