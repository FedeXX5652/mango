"""Refresco automatico de cotizaciones desde una API publica (ver 0005).

Fuente: `https://api.exchangerate-api.com/v4/latest/{CODE}`, gratuita y sin
clave. Publica **una cotizacion por dia** (viene `date` en el payload), no en
tiempo real: por eso el refresco es idempotente por fecha y no hace falta un
timer corto.

**Se pide una llamada por moneda**, `/latest/{extranjera}`, y se lee
`rates[base]`. Se podria hacer una sola llamada a `/latest/{base}` y dar vuelta
el numero, pero la API redondea a ~6 digitos y el inverso arrastra ese error;
ademas asi la fila queda en la direccion en que se lee ("1 USD = 1735,10 ARS").
Son una o dos monedas en la practica.

Ojo con Argentina: para ARS esta API da la **oficial**, que no es la que uno
paga (MEP, tarjeta). Para eso existe `users.fx_manual`: la moneda queda fuera
del automatico y se carga a mano, y `source` distingue de donde vino cada dato.
"""

import uuid
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
from typing import Protocol

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.account import Account
from app.models.fx import ExchangeRate
from app.models.user import User

# Etiqueta de origen de las filas que crea el refresco. Una fila `manual` con la
# misma fecha gana al mostrar (ver `crud.fx.latest_rate`).
FUENTE_AUTO = "auto"


@dataclass
class Resultado:
    """Que hizo el refresco. Se devuelve tal cual por la API para que la
    pantalla pueda decir algo concreto."""

    actualizadas: list[str] = field(default_factory=list)
    # Ya estaban al dia (misma fecha, misma fuente): no se toco nada.
    sin_cambios: list[str] = field(default_factory=list)
    # Excluidas a proposito por el usuario (`fx_manual`).
    manuales: list[str] = field(default_factory=list)
    # No se pudieron traer (la API fallo o no cotiza ese par).
    fallidas: list[str] = field(default_factory=list)


class Traer(Protocol):
    """Firma de "traeme la cotizacion de `origen` contra `destino`". Se inyecta
    para poder probar el servicio sin salir a la red."""

    async def __call__(self, origen: str, destino: str) -> tuple[Decimal, date] | None: ...


async def traer_de_api(origen: str, destino: str) -> tuple[Decimal, date] | None:
    url = settings.fx_api_url.format(base=origen)
    try:
        async with httpx.AsyncClient(timeout=settings.fx_timeout_s) as cliente:
            resp = await cliente.get(url)
            resp.raise_for_status()
            datos = resp.json()
    except (httpx.HTTPError, ValueError):
        # Sin conexion, timeout, 4xx/5xx o JSON invalido: el refresco no es
        # critico, se informa como fallida y la app sigue con lo que tenia.
        return None

    tasas = datos.get("rates") or {}
    valor = tasas.get(destino)
    if valor is None:
        return None
    try:
        # Decimal desde el string, no desde el float: el JSON trae un numero y
        # pasarlo por float le mete error binario a algo que multiplica plata.
        rate = Decimal(str(valor))
    except (ArithmeticError, ValueError):
        return None
    if rate <= 0:
        return None

    fecha = datos.get("date")
    try:
        rate_date = date.fromisoformat(fecha) if fecha else date.today()
    except ValueError:
        rate_date = date.today()
    return rate, rate_date


async def monedas_del_usuario(session: AsyncSession, owner_id: uuid.UUID, base: str) -> list[str]:
    """Monedas que hay que cotizar: las de las cuentas del usuario, menos la
    base (que no se cotiza contra si misma)."""
    stmt = (
        select(Account.currency)
        .where(Account.owner_id == owner_id, Account.deleted_at.is_(None))
        .distinct()
    )
    filas = (await session.execute(stmt)).scalars().all()
    return sorted({c.strip().upper() for c in filas if c} - {base.strip().upper()})


async def refrescar(
    session: AsyncSession,
    owner_id: uuid.UUID,
    *,
    forzar: bool = False,
    traer: Traer | None = None,
) -> Resultado:
    """Trae la cotizacion de cada moneda del usuario contra su moneda base.

    Idempotente por fecha: si ya hay una fila `auto` de esa fecha para el par,
    no se vuelve a pedir (salvo `forzar`). Asi se puede llamar al abrir la app
    sin gastar una llamada por vez.
    """
    fetch = traer or traer_de_api
    usuario = await session.get(User, owner_id)
    if usuario is None:
        return Resultado()

    base = usuario.base_currency.strip().upper()
    manuales = {c.strip().upper() for c in (usuario.fx_manual or [])}
    res = Resultado()

    for moneda in await monedas_del_usuario(session, owner_id, base):
        if moneda in manuales:
            res.manuales.append(moneda)
            continue

        traido = await fetch(moneda, base)
        if traido is None:
            res.fallidas.append(moneda)
            continue
        rate, rate_date = traido

        existente = (
            await session.execute(
                select(ExchangeRate).where(
                    ExchangeRate.base_currency == moneda,
                    ExchangeRate.quote_currency == base,
                    ExchangeRate.rate_date == rate_date,
                    ExchangeRate.source == FUENTE_AUTO,
                    ExchangeRate.deleted_at.is_(None),
                )
            )
        ).scalar_one_or_none()

        if existente is not None:
            if not forzar and existente.rate == rate:
                res.sin_cambios.append(moneda)
                continue
            # Misma fecha y fuente: se corrige la fila, no se crea otra (el
            # unico parcial lo impide, y son el mismo dato).
            existente.rate = rate
            res.actualizadas.append(moneda)
            continue

        session.add(
            ExchangeRate(
                # Lo crea el servidor, como las recurrentes.
                id=uuid.uuid4(),
                base_currency=moneda,
                quote_currency=base,
                rate=rate,
                rate_date=rate_date,
                source=FUENTE_AUTO,
            )
        )
        res.actualizadas.append(moneda)

    await session.commit()
    return res
