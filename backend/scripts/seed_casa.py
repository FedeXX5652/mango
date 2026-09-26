"""Semilla de demo: un segundo usuario (Beto) y un grupo 'Casa' con los dos,
como un hogar compartido, con categorias de grupo y algunos gastos compartidos
de cada uno.

Idempotente: usa ids fijos, asi correrlo dos veces no duplica nada. Reusa el
CRUD real (create_group siembra el arbol de categorias del grupo; add_member y
create_transaction validan las mismas reglas que la API), no SQL suelto.

Correr:  ../.venv/Scripts/python.exe -m scripts.seed_casa   (desde backend/)
"""

import asyncio
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from app.core.config import settings
from app.core.seguridad import hashear
from app.crud import group as crud_group
from app.crud import transaction as crud_tx
from app.db import SessionLocal
from app.models.account import Account
from app.models.category import Category
from app.models.user import User
from app.schemas.group import GroupCreate
from app.schemas.transaction import TransactionCreate

# Ids fijos: la gracia de la idempotencia.
BETO_ID = uuid.UUID("00000000-0000-0000-0000-000000000002")
BETO_ACC_ID = uuid.UUID("0000000b-e70a-4000-8000-000000000001")
CASA_ID = uuid.UUID("0000000c-a5a0-4000-8000-000000000001")

YO_ID = settings.seed_user_id
# Cuenta principal de 'yo' (Efectivo ARS), la que paga lo de yo.
YO_ACC_ID = uuid.UUID("8dd1cf0b-6689-4996-ac9a-a3fa881e7a2b")

AHORA = datetime.now(UTC)


async def _asegurar_beto(session) -> None:
    beto = await session.get(User, BETO_ID)
    if beto is None:
        session.add(
            User(
                id=BETO_ID,
                username="beto",
                email="beto@mango.local",
                # Misma clave temporal que el semilla ('mango'), pero ya usable:
                # es un usuario de prueba, no forzamos el cambio.
                password_hash=hashear(settings.seed_user_password),
                must_change_password=False,
                display_name="Beto",
                base_currency="ARS",
            )
        )
        print("+ usuario beto")
    acc = await session.get(Account, BETO_ACC_ID)
    if acc is None:
        session.add(
            Account(
                id=BETO_ACC_ID,
                owner_id=BETO_ID,
                name="Efectivo",
                type="cash",
                currency="ARS",
            )
        )
        print("+ cuenta de beto")
    await session.flush()


# Categorias propias de la Casa, para que la diferencia con las personales se vea
# de una en los selectores (nombre + icono distintos del arbol por defecto).
CATS_CASA = [
    ("Mascotas", "expense", "mascota"),
    ("Vacaciones", "expense", "avion"),
    ("Regalos", "expense", "regalo"),
]


async def _asegurar_grupo(session) -> None:
    grupo = await session.get(crud_group.Group, CASA_ID)
    if grupo is None:
        # create_group deja a 'yo' de owner (principal) y siembra el arbol de
        # categorias DEL grupo. Color azul: la marca de origen en toda la app.
        await crud_group.create_group(
            session,
            YO_ID,
            GroupCreate(id=CASA_ID, name="Casa", base_currency="ARS", color="#2563EB"),
        )
        print("+ grupo Casa (yo = owner, color azul) + arbol de categorias del grupo")
    else:
        grupo.color = grupo.color or "#2563EB"
    if await crud_group.membresia(session, CASA_ID, BETO_ID) is None:
        await crud_group.add_member(session, CASA_ID, "beto")
        print("+ beto agregado al grupo")
    # Categorias distintivas de la Casa (idempotente por nombre).
    for nombre, kind, icono in CATS_CASA:
        existe = (
            await session.execute(
                select(Category.id).where(
                    Category.group_id == CASA_ID,
                    Category.name == nombre,
                    Category.deleted_at.is_(None),
                )
            )
        ).scalar_one_or_none()
        if existe is None:
            session.add(
                Category(
                    id=uuid.uuid4(),
                    group_id=CASA_ID,
                    name=nombre,
                    kind=kind,
                    icon=icono,
                )
            )
            print(f"+ categoria de grupo: {nombre}")
    await session.flush()


async def _cat_de_grupo(session, nombre: str) -> uuid.UUID:
    cat = (
        await session.execute(
            select(Category.id).where(
                Category.group_id == CASA_ID,
                Category.name == nombre,
                Category.deleted_at.is_(None),
            )
        )
    ).scalar_one()
    return cat


async def _gasto(session, *, tx_id, owner_id, account_id, category_id, amount, payee, dias) -> None:
    if await session.get(crud_tx.Transaction, tx_id) is not None:
        return
    await crud_tx.create_transaction(
        session,
        owner_id,
        TransactionCreate(
            id=tx_id,
            kind="expense",
            occurred_at=AHORA - timedelta(days=dias),
            amount=amount,
            currency="ARS",
            account_id=account_id,
            category_id=category_id,
            payee=payee,
            visibility="shared",
            group_id=CASA_ID,
        ),
    )
    print(f"+ gasto compartido: {payee} ({amount / 100:.2f})")


async def main() -> None:
    async with SessionLocal() as session:
        await _asegurar_beto(session)
        await _asegurar_grupo(session)

        super_id = await _cat_de_grupo(session, "Supermercado")
        nafta_id = await _cat_de_grupo(session, "Nafta")

        # Gastos de cada uno, pagados de SU cuenta (la plata es de quien paga,
        # ver 0014), pero compartidos con la Casa y con categoria del grupo.
        await _gasto(
            session,
            tx_id=uuid.UUID("0000a5a0-0000-4000-8000-000000000001"),
            owner_id=YO_ID,
            account_id=YO_ACC_ID,
            category_id=super_id,
            amount=1530075,  # 15.300,75
            payee="Coto",
            dias=2,
        )
        await _gasto(
            session,
            tx_id=uuid.UUID("0000a5a0-0000-4000-8000-000000000002"),
            owner_id=BETO_ID,
            account_id=BETO_ACC_ID,
            category_id=nafta_id,
            amount=820000,  # 8.200,00
            payee="YPF",
            dias=1,
        )
        await _gasto(
            session,
            tx_id=uuid.UUID("0000a5a0-0000-4000-8000-000000000003"),
            owner_id=BETO_ID,
            account_id=BETO_ACC_ID,
            category_id=super_id,
            amount=430050,  # 4.300,50
            payee="Carrefour",
            dias=0,
        )
        await session.commit()
        print("listo.")


if __name__ == "__main__":
    asyncio.run(main())
