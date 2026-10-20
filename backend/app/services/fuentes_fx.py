"""De donde salen las cotizaciones automaticas (1.7.0, ver 0031).

Todas gratis y sin clave. Sin dato (un dia que todavia no se publico, el 404 de
la fuente) devuelven vacio o None. Si la fuente no contesta levantan
`SinRespuesta`: el refresco lo informa y la app sigue con lo que tenia.

- **ArgentinaDatos** (`/cotizaciones/dolares/{casa}`): los dolares argentinos,
  dia por dia, con compra y venta. Se usa la **venta** (P4). Oficial y blue desde
  2011, MEP (`bolsa`) desde 2018-10, tarjeta desde 2019-12. Tambien publica el
  oficial del BNA de otras monedas (`/cotizaciones/{moneda}`: EUR, BRL, CLP, UYU)
  desde 2023-10.
- **Frankfurter** (BCE): 1 USD = X de unas 30 monedas, dias habiles, desde 1999.
- **exchangerate-api**: el ultimo valor de casi cualquier moneda, sin historia.
  Lo que no cubre ninguna de las otras dos.

Los numeros se leen como `Decimal` desde el texto del JSON, nunca como float: una
cotizacion multiplica plata.
"""

import json
import logging
from datetime import date
from decimal import Decimal, InvalidOperation
from typing import Any

import httpx

from app.core.config import settings

log = logging.getLogger(__name__)

# Nuestro nombre de cada dolar -> el de ArgentinaDatos.
CASAS = {"oficial": "oficial", "mep": "bolsa", "blue": "blue", "tarjeta": "tarjeta"}
# Monedas con el oficial del BNA en ArgentinaDatos (ademas del USD).
MONEDAS_AD = frozenset({"EUR", "BRL", "CLP", "UYU"})


class SinRespuesta(Exception):
    """La fuente no contesto: sin conexion, timeout, un error suyo o un JSON que
    no se entiende. No es lo mismo que "no hay dato" (404)."""


async def _get(url: str) -> Any | None:
    """El JSON de `url`, con los numeros como Decimal. None si la fuente dice que
    no hay dato (404)."""
    try:
        async with httpx.AsyncClient(timeout=settings.fx_timeout_s) as cliente:
            resp = await cliente.get(url)
            if resp.status_code == 404:
                return None
            resp.raise_for_status()
            return json.loads(resp.text, parse_float=Decimal, parse_int=Decimal)
    except (httpx.HTTPError, ValueError) as exc:
        log.warning("cotizaciones: %s no respondio (%s)", url, exc.__class__.__name__)
        raise SinRespuesta(url) from exc


def _valor(crudo: Any) -> Decimal | None:
    try:
        v = Decimal(crudo)
    except (InvalidOperation, TypeError, ValueError):
        return None
    return v if v > 0 else None


def _fecha(crudo: Any) -> date | None:
    try:
        return date.fromisoformat(str(crudo))
    except ValueError:
        return None


def _puntos(lista: Any) -> list[tuple[date, Decimal]]:
    """[{fecha, venta}, ...] -> [(fecha, venta)], salteando lo que no se entiende."""
    salida = []
    for p in lista if isinstance(lista, list) else []:
        if not isinstance(p, dict):
            continue
        f, v = _fecha(p.get("fecha")), _valor(p.get("venta"))
        if f and v:
            salida.append((f, v))
    return salida


def _ruta_dia(fecha: date) -> str:
    return f"{fecha.year}/{fecha.month:02d}/{fecha.day:02d}"


async def dolar_historia(casa: str) -> list[tuple[date, Decimal]]:
    """Toda la serie de un dolar: 1 USD = venta ARS."""
    return _puntos(
        await _get(f"{settings.fx_argentinadatos_url}/cotizaciones/dolares/{CASAS[casa]}")
    )


async def dolar_dia(casa: str, fecha: date) -> Decimal | None:
    datos = await _get(
        f"{settings.fx_argentinadatos_url}/cotizaciones/dolares/{CASAS[casa]}/{_ruta_dia(fecha)}"
    )
    return _valor(datos.get("venta")) if isinstance(datos, dict) else None


async def bna_historia(moneda: str) -> list[tuple[date, Decimal]]:
    """El oficial del BNA de una moneda: 1 moneda = venta ARS. `USD` tambien."""
    return _puntos(await _get(f"{settings.fx_argentinadatos_url}/cotizaciones/{moneda.lower()}"))


async def bna_dia(moneda: str, fecha: date) -> Decimal | None:
    datos = await _get(
        f"{settings.fx_argentinadatos_url}/cotizaciones/{moneda.lower()}/{_ruta_dia(fecha)}"
    )
    return _valor(datos.get("venta")) if isinstance(datos, dict) else None


async def bce_monedas() -> frozenset[str]:
    """Las monedas que publica el BCE (por Frankfurter)."""
    datos = await _get(f"{settings.fx_frankfurter_url}/currencies")
    return frozenset(datos) if isinstance(datos, dict) else frozenset()


async def bce_serie(desde: date, hasta: date, monedas: list[str]) -> dict[date, dict[str, Decimal]]:
    """1 USD = X de cada moneda, por dia habil entre `desde` y `hasta`."""
    datos = await _get(
        f"{settings.fx_frankfurter_url}/{desde.isoformat()}..{hasta.isoformat()}"
        f"?base=USD&symbols={','.join(sorted(monedas))}"
    )
    salida: dict[date, dict[str, Decimal]] = {}
    tasas = datos.get("rates") if isinstance(datos, dict) else None
    for crudo, del_dia in (tasas or {}).items():
        f = _fecha(crudo)
        if f is None or not isinstance(del_dia, dict):
            continue
        valores = {m: v for m, x in del_dia.items() if (v := _valor(x)) is not None}
        if valores:
            salida[f] = valores
    return salida


async def ultimo(base: str) -> tuple[date, dict[str, Decimal]] | None:
    """El ultimo valor publicado de 1 `base` en cada moneda (exchangerate-api)."""
    datos = await _get(settings.fx_api_url.format(base=base))
    if not isinstance(datos, dict):
        return None
    f = _fecha(datos.get("date"))
    tasas = datos.get("rates")
    if f is None or not isinstance(tasas, dict):
        return None
    return f, {m: v for m, x in tasas.items() if (v := _valor(x)) is not None}
