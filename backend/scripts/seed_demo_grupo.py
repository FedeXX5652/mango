"""Demo rica del grupo Casa (fase 3b.3/3b.4): gastos variados, deudas, splits
desiguales, transferencias a la cuenta conjunta (fondeo), gastos pagados con la
conjunta (sin deuda) y pagos entre miembros (real y "marcado saldado").

Idempotente: ids fijos. Reusa el CRUD real. Correr desde backend/:
    ../.venv/Scripts/python.exe -m scripts.seed_demo_grupo
"""

import asyncio
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from app.crud import settlement as crud_set
from app.crud import split as crud_split
from app.crud import transaction as crud_tx
from app.db import SessionLocal
from app.models.category import Category
from app.schemas.settlement import SettlementCreate
from app.schemas.split import SplitCreate
from app.schemas.transaction import TransactionCreate

CASA = uuid.UUID("0000000c-a5a0-4000-8000-000000000001")
YO = uuid.UUID("00000000-0000-0000-0000-000000000001")
BETO = uuid.UUID("00000000-0000-0000-0000-000000000002")
YO_ACC = uuid.UUID("8dd1cf0b-6689-4996-ac9a-a3fa881e7a2b")
BETO_ACC = uuid.UUID("0000000b-e70a-4000-8000-000000000001")
JOINT = uuid.UUID("048db630-886e-4742-a47a-a7f7ec3f9446")
AHORA = datetime.now(UTC)


def fid(n: int) -> uuid.UUID:
    # Ids deterministas para idempotencia.
    return uuid.UUID(f"0000de00-0000-4000-8000-{n:012d}")


async def _cat(session, nombre: str) -> uuid.UUID:
    return (
        await session.execute(
            select(Category.id).where(
                Category.group_id == CASA, Category.name == nombre, Category.deleted_at.is_(None)
            )
        )
    ).scalar_one()


async def _existe(session, model, id_) -> bool:
    return await session.get(model, id_) is not None


async def _gasto(session, n, *, owner, account, cat, amount, payee, dias, splits=None) -> None:
    tx_id = fid(n)
    if not await _existe(session, crud_tx.Transaction, tx_id):
        await crud_tx.create_transaction(
            session,
            owner,
            TransactionCreate(
                id=tx_id,
                kind="expense",
                occurred_at=AHORA - timedelta(days=dias),
                amount=amount,
                currency="ARS",
                account_id=account,
                category_id=cat,
                payee=payee,
                visibility="shared",
                group_id=CASA,
            ),
        )
        if splits:
            for i, (usuario, monto) in enumerate(splits):
                await crud_split.create_split(
                    session,
                    owner,
                    SplitCreate(
                        id=fid(n * 100 + i), transaction_id=tx_id, user_id=usuario, amount=monto
                    ),
                )
        print(f"+ gasto {payee} ({amount / 100:.2f})")


async def _transfer(session, n, *, owner, desde, hacia, amount, dias) -> None:
    tx_id = fid(n)
    if not await _existe(session, crud_tx.Transaction, tx_id):
        await crud_tx.create_transaction(
            session,
            owner,
            TransactionCreate(
                id=tx_id,
                kind="transfer",
                occurred_at=AHORA - timedelta(days=dias),
                amount=amount,
                currency="ARS",
                account_id=desde,
                transfer_account_id=hacia,
            ),
        )
        print(f"+ fondeo caja conjunta ({amount / 100:.2f})")


async def _pago(session, n, *, de, a, amount, account=None) -> None:
    pid = fid(n)
    from app.models.user import Settlement

    if not await _existe(session, Settlement, pid):
        await crud_set.create_settlement(
            session,
            de,
            SettlementCreate(
                id=pid,
                group_id=CASA,
                from_user_id=de,
                to_user_id=a,
                amount=amount,
                currency="ARS",
                occurred_at=AHORA,
                account_id=account,
            ),
        )
        tipo = "pago real" if account else "marcado saldado"
        print(f"+ {tipo} ({amount / 100:.2f})")


async def main() -> None:
    async with SessionLocal() as session:
        rest = await _cat(session, "Restaurante")
        med = await _cat(session, "Medicamentos")
        stream = await _cat(session, "Streaming")
        expensas = await _cat(session, "Expensas")
        super_ = await _cat(session, "Supermercado")

        # Gasto con split DESIGUAL (70/30): Yo paga la cena, Beto pone 30%.
        await _gasto(
            session,
            10,
            owner=YO,
            account=YO_ACC,
            cat=rest,
            amount=1200000,
            payee="Don Julio",
            dias=4,
            splits=[(YO, 840000), (BETO, 360000)],
        )
        # Gastos personales compartidos, reparto igual.
        await _gasto(
            session,
            11,
            owner=BETO,
            account=BETO_ACC,
            cat=med,
            amount=500000,
            payee="Farmacity",
            dias=3,
        )
        await _gasto(
            session,
            12,
            owner=YO,
            account=YO_ACC,
            cat=stream,
            amount=350000,
            payee="Netflix",
            dias=2,
        )

        # Fondeo de la cuenta conjunta: cada uno transfiere de lo suyo.
        await _transfer(session, 20, owner=YO, desde=YO_ACC, hacia=JOINT, amount=2000000, dias=5)
        await _transfer(
            session, 21, owner=BETO, desde=BETO_ACC, hacia=JOINT, amount=1500000, dias=5
        )

        # Gasto pagado CON la conjunta: suma al grupo, NO genera deuda.
        await _gasto(
            session,
            30,
            owner=YO,
            account=JOINT,
            cat=expensas,
            amount=1800000,
            payee="Expensas",
            dias=1,
        )
        await _gasto(
            session,
            31,
            owner=BETO,
            account=JOINT,
            cat=super_,
            amount=250000,
            payee="Verduleria",
            dias=0,
        )

        # Un pago REAL (Beto le paga a Yo desde su cuenta) y uno marcado saldado.
        await _pago(session, 40, de=BETO, a=YO, amount=200000, account=BETO_ACC)
        await _pago(session, 41, de=BETO, a=YO, amount=50000)  # marcado saldado

        await session.commit()
        print("listo.")


if __name__ == "__main__":
    asyncio.run(main())
