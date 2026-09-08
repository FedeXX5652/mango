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
    session: AsyncSession, owner_id: uuid.UUID, category: Category, data: CategoryUpdate
) -> Category:
    campos = data.model_dump(exclude_unset=True)

    # Mover de padre: mismas reglas que al crear, mas las que solo aplican al
    # mover. `exclude_unset` distingue "no lo mandes" de "ponelo en null".
    if "parent_id" in campos:
        nuevo = campos["parent_id"]
        if nuevo is not None:
            if nuevo == category.id:
                raise DomainError("Una categoria no puede ser su propio padre")
            padre = await _get_owned(session, owner_id, nuevo)
            if padre is None:
                raise DomainError("La categoria padre no existe")
            if padre.parent_id is not None:
                raise DomainError("Solo se permiten dos niveles de categoria")
            if padre.kind != category.kind:
                raise DomainError("La subcategoria debe tener el mismo kind que el padre")
            # Si la que se mueve tiene hijas, colgarla de otra haria tres niveles.
            hijas = (
                await session.execute(
                    select(Category.id).where(
                        Category.parent_id == category.id,
                        Category.deleted_at.is_(None),
                    )
                )
            ).first()
            if hijas is not None:
                raise DomainError(
                    "Una categoria con subcategorias no puede pasar a ser subcategoria"
                )

    for field, value in campos.items():
        setattr(category, field, value)
    await session.commit()
    await session.refresh(category)
    return category


async def soft_delete_category(session: AsyncSession, category: Category) -> None:
    category.deleted_at = func.now()
    await session.commit()
