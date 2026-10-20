"""Cotizaciones automaticas (1.7.0, ver 0031; antes 0005).

**Todo contra el dolar.** La serie automatica guarda solo pares contra el USD:

- USD -> ARS, uno por cada dolar argentino (`casa`: oficial, mep, blue, tarjeta);
- USD -> X para las demas monedas (`casa` NULL).

La conversion entre dos monedas cualesquiera se arma al leer, en el cliente
(lib/cotizaciones): euro a pesos = euro->dolar x dolar->pesos, con el dolar que
la persona eligio para el euro. Por eso cambiar la moneda base no obliga a
regenerar nada. Las fuentes estan en `fuentes_fx`.

**La historia se carga una vez**, desde lo mas viejo entre `fx_historia_anios`
atras y el primer movimiento, y despues cada vuelta pide lo del dia. El valor de
los ultimos dias se corrige si la fuente lo cambio (el MEP se mueve durante el
dia); lo viejo no se toca. Lo cargado a mano nunca se toca: tiene otro `source`.

Lo corre el planificador cada hora (0029) y la app al abrir y con "Actualizar
ahora". Es idempotente: dos vueltas a la vez no duplican nada (`ON CONFLICT`).
"""

import time
import uuid
from collections.abc import Iterable
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from typing import Protocol
from zoneinfo import ZoneInfo

from sqlalchemy import func, select, text, union
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.account import Account
from app.models.fx import ExchangeRate
from app.models.transaction import Transaction
from app.models.user import Group, User
from app.services import fuentes_fx
from app.services.fuentes_fx import SinRespuesta

# Origen de las filas que trae el servidor. Lo cargado a mano lleva otro
# (`manual`, o la etiqueta que se eligio antes de la 1.7.0).
FUENTE_AUTO = "auto"
CASAS = tuple(fuentes_fx.CASAS)
# Los ultimos dias se vuelven a pedir y se corrigen si cambiaron.
RECIENTES = timedelta(days=3)
# Una serie tiene su historia si arranca a lo sumo esto despues de donde
# deberia: el primer dia habil del BCE puede caer unos dias despues.
TOLERANCIA = timedelta(days=7)
# La app pide el refresco al abrir: si recien se hizo, no se sale a la red.
PAUSA_S = 600

_UNICO = ["base_currency", "quote_currency", "rate_date", "source", "casa"]


class Fuentes(Protocol):
    """Lo que hace falta de `fuentes_fx`. Las pruebas pasan uno falso. Sin dato
    devuelven vacio; si la fuente no contesta, levantan `SinRespuesta`."""

    async def dolar_historia(self, casa: str) -> list[tuple[date, Decimal]]: ...
    async def dolar_dia(self, casa: str, fecha: date) -> Decimal | None: ...
    async def bna_historia(self, moneda: str) -> list[tuple[date, Decimal]]: ...
    async def bna_dia(self, moneda: str, fecha: date) -> Decimal | None: ...
    async def bce_monedas(self) -> frozenset[str]: ...
    async def bce_serie(
        self, desde: date, hasta: date, monedas: list[str]
    ) -> dict[date, dict[str, Decimal]]: ...
    async def ultimo(self, base: str) -> tuple[date, dict[str, Decimal]] | None: ...


@dataclass
class _Memoria:
    """Lo que se aprende de las fuentes y no cambia en el dia. Vive en el proceso:
    al reiniciar se vuelve a preguntar."""

    # Las monedas del BCE.
    bce: frozenset[str] | None = None
    # Desde cuando tiene datos una fuente (el MEP empieza en 2018): asi una serie
    # que arranca despues de `desde` no se vuelve a pedir entera cada hora.
    inicio: dict[str, date] = field(default_factory=dict)
    ultima_vuelta: float = 0.0


_memoria = _Memoria()


def olvidar() -> None:
    """Para las pruebas: cada una empieza sin lo aprendido."""
    global _memoria
    _memoria = _Memoria()


@dataclass
class Informe:
    # Monedas cuya serie recibio algo nuevo o corregido ("USD" son los dolares).
    nuevas: set[str] = field(default_factory=set)
    # Monedas que no se pudieron traer.
    fallidas: set[str] = field(default_factory=set)
    filas: int = 0


Fila = tuple[str, str, date, Decimal, str | None]


def hoy_local() -> date:
    return datetime.now(UTC).astimezone(ZoneInfo(settings.tz)).date()


async def _desde(session: AsyncSession, hoy: date) -> date:
    """Desde donde guardar: `fx_historia_anios` atras, o el primer movimiento si
    es mas viejo (un movimiento viejo tiene que poder convertirse)."""
    desde = date(hoy.year - settings.fx_historia_anios, hoy.month, 1)
    primero = (
        await session.execute(
            select(func.min(Transaction.occurred_at)).where(Transaction.deleted_at.is_(None))
        )
    ).scalar_one_or_none()
    if primero is not None:
        local = primero.astimezone(ZoneInfo(settings.tz)).date()
        desde = min(desde, local.replace(day=1))
    return desde


async def monedas_en_uso(session: AsyncSession) -> set[str]:
    """Las monedas de cuentas, movimientos, usuarios y grupos, sin el dolar (el
    pivote) ni el peso (son los dolares)."""
    consulta = union(
        select(Account.currency).where(Account.deleted_at.is_(None)),
        select(Transaction.currency).where(Transaction.deleted_at.is_(None)),
        select(User.base_currency).where(User.deleted_at.is_(None)),
        select(Group.base_currency).where(Group.deleted_at.is_(None)),
    )
    filas = (await session.execute(consulta)).scalars().all()
    return {m.strip().upper() for m in filas if m} - {"USD", "ARS"}


async def _rango(
    session: AsyncSession, base: str, quote: str, casa: str | None
) -> tuple[date | None, date | None]:
    """La primera y la ultima fecha automaticas de una serie."""
    stmt = select(func.min(ExchangeRate.rate_date), func.max(ExchangeRate.rate_date)).where(
        ExchangeRate.base_currency == base,
        ExchangeRate.quote_currency == quote,
        ExchangeRate.source == FUENTE_AUTO,
        ExchangeRate.casa.is_(None) if casa is None else ExchangeRate.casa == casa,
        ExchangeRate.deleted_at.is_(None),
    )
    primera, ultima = (await session.execute(stmt)).one()
    return primera, ultima


def _le_falta_historia(serie: str, primera: date | None, desde: date) -> bool:
    if primera is None:
        return True
    objetivo = max(desde, _memoria.inicio.get(serie, desde))
    return primera > objetivo + TOLERANCIA


def _dias(desde: date, hasta: date) -> list[date]:
    return [desde + timedelta(days=i) for i in range((hasta - desde).days + 1)]


def _aprender_inicio(serie: str, puntos: Iterable[tuple[date, Decimal]]) -> None:
    fechas = [f for f, _ in puntos]
    if fechas:
        _memoria.inicio[serie] = min(fechas)


async def _dolares(
    session: AsyncSession, fuentes: Fuentes, desde: date, hoy: date, inf: Informe
) -> list[Fila]:
    filas: list[Fila] = []
    for casa in CASAS:
        serie = f"USD/{casa}"
        primera, ultima = await _rango(session, "USD", "ARS", casa)
        try:
            if (
                _le_falta_historia(serie, primera, desde)
                or ultima is None
                or ultima < hoy - RECIENTES
            ):
                puntos = await fuentes.dolar_historia(casa)
                if not puntos:
                    inf.fallidas.add("USD")
                    continue
                _aprender_inicio(serie, puntos)
                filas += [("USD", "ARS", f, v, casa) for f, v in puntos if desde <= f <= hoy]
                continue
            # Al dia: de la ultima conocida (que puede haber cambiado) a hoy.
            for f in _dias(ultima, hoy):
                v = await fuentes.dolar_dia(casa, f)
                if v is not None:
                    filas.append(("USD", "ARS", f, v, casa))
        except SinRespuesta:
            inf.fallidas.add("USD")
    return filas


async def _bce(
    session: AsyncSession, fuentes: Fuentes, monedas: set[str], desde: date, hoy: date, inf: Informe
) -> tuple[list[Fila], set[str]]:
    """Las del BCE, contra el dolar. Devuelve las filas y las monedas que el BCE
    no publica."""
    if not monedas:
        return [], set()
    if _memoria.bce is None:
        try:
            _memoria.bce = await fuentes.bce_monedas() or None
        except SinRespuesta:
            # Sin la lista no se sabe cuales son del BCE: van por las otras
            # fuentes, y se vuelve a preguntar en la vuelta siguiente.
            pass
    del_bce = sorted(monedas & (_memoria.bce or frozenset()))
    sin_historia, al_dia, ultimas = [], [], []
    for m in del_bce:
        primera, ultima = await _rango(session, "USD", m, None)
        if (
            _le_falta_historia(f"USD/{m}", primera, desde)
            or ultima is None
            or ultima < hoy - timedelta(days=30)
        ):
            sin_historia.append(m)
        else:
            al_dia.append(m)
            ultimas.append(ultima)
    filas: list[Fila] = []
    pedidos = [(desde, sin_historia), (min(ultimas, default=hoy), al_dia)]
    for inicio, lista in pedidos:
        if not lista:
            continue
        try:
            serie = await fuentes.bce_serie(inicio, hoy, lista)
        except SinRespuesta:
            inf.fallidas.update(lista)
            continue
        # Un fin de semana no hay dia habil nuevo: vacio no es falla si ya
        # estaban al dia.
        if not serie and lista is sin_historia:
            inf.fallidas.update(lista)
            continue
        for f, del_dia in serie.items():
            filas += [("USD", m, f, v, None) for m, v in del_dia.items() if m in lista]
        if lista is sin_historia:
            for m in lista:
                _aprender_inicio(f"USD/{m}", ((f, d[m]) for f, d in serie.items() if m in d))
    return filas, monedas - set(del_bce)


def _cruce(usd_ars: Decimal, x_ars: Decimal) -> Decimal:
    """1 USD en X a partir de las dos contra el peso, del mismo dia y la misma
    fuente: (USD -> ARS) / (X -> ARS)."""
    return (usd_ars / x_ars).quantize(Decimal("0.0000000001"))


async def _bna(
    session: AsyncSession, fuentes: Fuentes, monedas: set[str], desde: date, hoy: date, inf: Informe
) -> tuple[list[Fila], set[str]]:
    """Las que el BCE no publica pero el BNA si (UYU, CLP): el cruce contra el
    dolar oficial del mismo dia. Devuelve las filas y lo que sigue sin fuente."""
    propias = sorted(monedas & fuentes_fx.MONEDAS_AD)
    filas: list[Fila] = []
    usd: dict[date, Decimal] | None = None
    for m in propias:
        primera, ultima = await _rango(session, "USD", m, None)
        try:
            if (
                _le_falta_historia(f"USD/{m}", primera, desde)
                or ultima is None
                or ultima < hoy - RECIENTES
            ):
                if usd is None:
                    usd = dict(await fuentes.bna_historia("USD"))
                puntos = await fuentes.bna_historia(m)
                if not puntos or not usd:
                    inf.fallidas.add(m)
                    continue
                _aprender_inicio(f"USD/{m}", puntos)
                filas += [
                    ("USD", m, f, _cruce(usd[f], v), None)
                    for f, v in puntos
                    if desde <= f <= hoy and f in usd
                ]
                continue
            for f in _dias(ultima, hoy):
                u, v = await fuentes.bna_dia("USD", f), await fuentes.bna_dia(m, f)
                if u is not None and v is not None:
                    filas.append(("USD", m, f, _cruce(u, v), None))
        except SinRespuesta:
            inf.fallidas.add(m)
    return filas, monedas - set(propias)


async def _resto(fuentes: Fuentes, monedas: set[str], inf: Informe) -> list[Fila]:
    """Lo que no cubre nadie con historia: el ultimo valor, sin serie.

    Se guarda en la direccion del numero grande: la fuente da 6 decimales fijos,
    y 1 USD = 0,3 KWD perderia digitos (por eso 1 KWD = 3,25 USD)."""
    if not monedas:
        return []
    try:
        ultimo = await fuentes.ultimo("USD")
    except SinRespuesta:
        ultimo = None
    if ultimo is None:
        inf.fallidas.update(monedas)
        return []
    fecha, tasas = ultimo
    filas: list[Fila] = []
    for m in sorted(monedas):
        r = tasas.get(m)
        if r is None:
            inf.fallidas.add(m)
        elif r >= 1:
            filas.append(("USD", m, fecha, r, None))
        else:
            try:
                alreves = await fuentes.ultimo(m)
            except SinRespuesta:
                alreves = None
            s = alreves[1].get("USD") if alreves else None
            filas.append((m, "USD", fecha, s, None) if s else ("USD", m, fecha, r, None))
    return filas


async def _guardar(session: AsyncSession, filas: list[Fila], hoy: date, inf: Informe) -> None:
    """Inserta lo que falta; en los ultimos dias tambien corrige el valor."""
    unicas: dict[tuple, Fila] = {}
    for fila in filas:
        base, quote, f, _, casa = fila
        unicas[(base, quote, f, casa)] = fila
    if not unicas:
        return

    def valores(lote: list[Fila]) -> list[dict]:
        return [
            {
                "id": uuid.uuid4(),
                "base_currency": b,
                "quote_currency": q,
                "rate_date": f,
                "rate": r,
                "source": FUENTE_AUTO,
                "casa": c,
            }
            for b, q, f, r, c in lote
        ]

    limite = hoy - RECIENTES
    viejas = [x for x in unicas.values() if x[2] < limite]
    recientes = [x for x in unicas.values() if x[2] >= limite]
    for i in range(0, len(viejas), 1000):
        stmt = (
            pg_insert(ExchangeRate)
            .values(valores(viejas[i : i + 1000]))
            .on_conflict_do_nothing(index_elements=_UNICO, index_where=text("deleted_at IS NULL"))
            .returning(ExchangeRate.base_currency, ExchangeRate.quote_currency)
        )
        _anotar((await session.execute(stmt)).all(), inf)
    if recientes:
        alta = pg_insert(ExchangeRate).values(valores(recientes))
        stmt = alta.on_conflict_do_update(
            index_elements=_UNICO,
            index_where=text("deleted_at IS NULL"),
            set_={"rate": alta.excluded.rate, "updated_at": func.now()},
            where=ExchangeRate.rate != alta.excluded.rate,
        ).returning(ExchangeRate.base_currency, ExchangeRate.quote_currency)
        _anotar((await session.execute(stmt)).all(), inf)


def _anotar(pares: list, inf: Informe) -> None:
    for base, quote in pares:
        inf.filas += 1
        inf.nuevas.add(quote if base == "USD" and quote != "ARS" else base)


async def actualizar(
    session: AsyncSession,
    *,
    hoy: date | None = None,
    fuentes: Fuentes | None = None,
    monedas: set[str] | None = None,
    desde: date | None = None,
) -> Informe:
    """Completa la historia que falte y trae lo del dia. Hace commit."""
    # Antes del primer `await`: un pedido de la app que llegue mientras tanto ya
    # ve que hay una vuelta en curso y no sale a la red.
    _memoria.ultima_vuelta = time.monotonic()
    fuentes = fuentes or fuentes_fx
    hoy = hoy or hoy_local()
    desde = desde or await _desde(session, hoy)
    monedas = await monedas_en_uso(session) if monedas is None else monedas - {"USD", "ARS"}

    inf = Informe()
    filas = await _dolares(session, fuentes, desde, hoy, inf)
    del_bce, faltan = await _bce(session, fuentes, monedas, desde, hoy, inf)
    del_bna, faltan = await _bna(session, fuentes, faltan, desde, hoy, inf)
    filas += del_bce + del_bna + await _resto(fuentes, faltan, inf)
    await _guardar(session, filas, hoy, inf)
    await session.commit()
    return inf


async def tarea(session: AsyncSession) -> int:
    """La del planificador, cada hora. Devuelve cuantas filas escribio."""
    return (await actualizar(session)).filas


@dataclass
class Resultado:
    """Lo que la pantalla dice despues de "Actualizar ahora", por moneda del
    usuario. Mantiene la forma de antes de la 1.7.0."""

    actualizadas: list[str] = field(default_factory=list)
    sin_cambios: list[str] = field(default_factory=list)
    # Las que el usuario maneja a mano (`fx_manual`).
    manuales: list[str] = field(default_factory=list)
    fallidas: list[str] = field(default_factory=list)


async def refrescar(
    session: AsyncSession,
    owner_id: uuid.UUID,
    *,
    forzar: bool = False,
    fuentes: Fuentes | None = None,
) -> Resultado:
    """El refresco que pide la app. Sin `forzar`, si recien se hizo una vuelta no
    sale a la red (la app lo pide cada vez que abre)."""
    usuario = await session.get(User, owner_id)
    if usuario is None:
        return Resultado()
    inf = Informe()
    if forzar or time.monotonic() - _memoria.ultima_vuelta > PAUSA_S:
        # Se marca sin ceder el control entre la pregunta y la marca: dos
        # pedidos a la vez (dos personas que abren la app) no salen los dos.
        _memoria.ultima_vuelta = time.monotonic()
        inf = await actualizar(session, fuentes=fuentes)

    base = usuario.base_currency.strip().upper()
    manuales = {c.strip().upper() for c in (usuario.fx_manual or [])}
    cuentas = (
        await session.execute(
            select(Account.currency)
            .where(Account.owner_id == owner_id, Account.deleted_at.is_(None))
            .distinct()
        )
    ).scalars()
    res = Resultado()
    for m in sorted({c.strip().upper() for c in cuentas} - {base}):
        # El peso y el dolar son la misma serie: los dolares.
        serie = "USD" if m in ("USD", "ARS") else m
        if m in manuales:
            res.manuales.append(m)
        elif serie in inf.fallidas:
            res.fallidas.append(m)
        elif serie in inf.nuevas:
            res.actualizadas.append(m)
        else:
            res.sin_cambios.append(m)
    return res
