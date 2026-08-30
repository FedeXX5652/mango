"""Siembra el usuario semilla de fase 1.

Fase 1 es de un solo usuario sin auth de servidor: este usuario fijo es el
`owner_id` de todo lo que se crea. Idempotente: se puede correr las veces que
haga falta.

    python -m app.seed
"""

import asyncio
import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db import SessionLocal
from app.models.category import Category
from app.models.user import User

# Arbol de categorias por defecto: (nombre, kind, [subcategorias]).
# Sin esto no se puede cargar un gasto al primer arranque (principio de validez 3.1).
DEFAULT_CATEGORIES: list[tuple[str, str, list[str]]] = [
    ("Vivienda", "expense", ["Alquiler", "Expensas", "Servicios"]),
    ("Transporte", "expense", ["Colectivo", "Nafta", "Taxi"]),
    ("Comida", "expense", ["Supermercado", "Restaurante", "Delivery"]),
    ("Salud", "expense", ["Medicamentos", "Consultas"]),
    ("Ocio", "expense", ["Streaming", "Salidas"]),
    ("Otros", "expense", []),
    ("Sueldo", "income", []),
    ("Extras", "income", []),
]


async def seed_default_user(session: AsyncSession) -> User:
    """Devuelve el usuario semilla; lo crea si no existe. No hace commit."""
    user = await session.get(User, settings.seed_user_id)
    if user is None:
        user = User(
            id=settings.seed_user_id,
            email=settings.seed_user_email,
            # El acceso se controla con el PIN del cliente; no hay password de
            # servidor en fase 1. Placeholder no usable como hash.
            password_hash="!",
            display_name=settings.seed_user_name,
        )
        session.add(user)
        await session.flush()
    return user


async def seed_default_categories(session: AsyncSession, owner_id: uuid.UUID) -> int:
    """Crea el arbol por defecto si el usuario todavia no tiene categorias.
    Idempotente: si ya tiene alguna, no toca nada. Devuelve cuantas creo."""
    existing = (
        await session.execute(
            select(func.count())
            .select_from(Category)
            .where(Category.owner_id == owner_id, Category.deleted_at.is_(None))
        )
    ).scalar_one()
    if existing:
        return 0

    created = 0
    for order, (name, kind, children) in enumerate(DEFAULT_CATEGORIES):
        parent = Category(
            id=uuid.uuid4(), owner_id=owner_id, name=name, kind=kind, sort_order=order
        )
        session.add(parent)
        created += 1
        for child_order, child_name in enumerate(children):
            session.add(
                Category(
                    id=uuid.uuid4(),
                    owner_id=owner_id,
                    parent_id=parent.id,
                    name=child_name,
                    kind=kind,
                    sort_order=child_order,
                )
            )
            created += 1
    await session.flush()
    return created


async def main() -> None:
    async with SessionLocal() as session:
        user = await seed_default_user(session)
        await seed_default_categories(session, user.id)
        await session.commit()


if __name__ == "__main__":
    asyncio.run(main())
