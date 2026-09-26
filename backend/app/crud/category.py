"""Operaciones de base para categorias. Impone en la app dos reglas que la
base no fuerza: jerarquia de solo dos niveles, y que la subcategoria comparta
el kind de su padre.

Ambito (fase 3b, ver 0014): una categoria es **personal** (owner_id) o **de un
grupo** (group_id). La de grupo la ve y edita cualquier miembro, y los gastos
compartidos se categorizan con ella. La autorizacion pasa de "es mia" a "la
puedo tocar": mia, o de un grupo del que soy miembro.
"""

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import DomainError
from app.crud.group import membresia
from app.models.category import Category
from app.schemas.category import CategoryCreate, CategoryUpdate


def _mismo_ambito(a: Category, b: Category) -> bool:
    """Padre e hija tienen que ser del mismo ambito: no se cuelga una categoria
    de grupo bajo una personal ni al reves."""
    return a.owner_id == b.owner_id and a.group_id == b.group_id


async def _accesible(
    session: AsyncSession, user_id: uuid.UUID, category_id: uuid.UUID
) -> Category | None:
    """La categoria si el usuario la puede tocar: es personal suya, o es de un
    grupo del que es miembro. None si no."""
    cat = (
        await session.execute(
            select(Category).where(
                Category.id == category_id,
                Category.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if cat is None:
        return None
    if cat.owner_id == user_id:
        return cat
    if cat.group_id is not None and await membresia(session, cat.group_id, user_id) is not None:
        return cat
    return None


async def create_category(
    session: AsyncSession, user_id: uuid.UUID, data: CategoryCreate
) -> Category:
    # Ambito: de grupo (miembro) o personal.
    if data.group_id is not None:
        if await membresia(session, data.group_id, user_id) is None:
            raise DomainError("El grupo no existe")
        owner_id: uuid.UUID | None = None
        group_id: uuid.UUID | None = data.group_id
    else:
        owner_id = user_id
        group_id = None

    if data.parent_id is not None:
        parent = await _accesible(session, user_id, data.parent_id)
        if parent is None:
            raise DomainError("La categoria padre no existe")
        if parent.owner_id != owner_id or parent.group_id != group_id:
            raise DomainError("La subcategoria debe ser del mismo ambito que el padre")
        if parent.parent_id is not None:
            raise DomainError("Solo se permiten dos niveles de categoria")
        if parent.kind != data.kind:
            raise DomainError("La subcategoria debe tener el mismo kind que el padre")

    campos = data.model_dump(exclude={"group_id"})
    category = Category(owner_id=owner_id, group_id=group_id, **campos)
    session.add(category)
    await session.commit()
    await session.refresh(category)
    return category


async def get_category(
    session: AsyncSession, user_id: uuid.UUID, category_id: uuid.UUID
) -> Category | None:
    return await _accesible(session, user_id, category_id)


async def update_category(
    session: AsyncSession, user_id: uuid.UUID, category: Category, data: CategoryUpdate
) -> Category:
    campos = data.model_dump(exclude_unset=True)

    if "parent_id" in campos:
        nuevo = campos["parent_id"]
        if nuevo is not None:
            if nuevo == category.id:
                raise DomainError("Una categoria no puede ser su propio padre")
            padre = await _accesible(session, user_id, nuevo)
            if padre is None:
                raise DomainError("La categoria padre no existe")
            if not _mismo_ambito(padre, category):
                raise DomainError("La subcategoria debe ser del mismo ambito que el padre")
            if padre.parent_id is not None:
                raise DomainError("Solo se permiten dos niveles de categoria")
            if padre.kind != category.kind:
                raise DomainError("La subcategoria debe tener el mismo kind que el padre")
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


async def es_categoria_de_grupo(
    session: AsyncSession, category_id: uuid.UUID, group_id: uuid.UUID
) -> bool:
    """¿La categoria es de ese grupo? Para validar que un gasto compartido use la
    taxonomia del grupo, no una categoria personal (ver 0014)."""
    cat = (
        await session.execute(
            select(Category.group_id).where(
                Category.id == category_id, Category.deleted_at.is_(None)
            )
        )
    ).scalar_one_or_none()
    return cat == group_id
