"""Reproductor de payloads de un cliente contra la API de hoy.

El banco de compatibilidad (ver decision 0012): la app es local-first y una PWA,
asi que un cliente **una version atras** sube payloads viejos contra un servidor
**nuevo**. Lo que rompe en un deploy no es el cliente entero, es la FORMA del
JSON que manda. Este reproductor toma esa forma —tal cual la produce el conector
del cliente (ver frontend/src/lib/powersync/conector `Subida`)— y la manda por
los mismos endpoints que usa la sincronizacion.

Un fixture es una **secuencia** de escrituras auto-contenida: primero las
entidades que hacen falta (cuenta, categoria) y despues lo que las referencia,
en orden. Asi se puede reproducir contra una base limpia sin datos de apoyo.

Cuando en fase 3 llegue un cambio no aditivo (el renombre email->username), se
agrega un fixture con la forma vieja y se verifica que el servidor nuevo lo
sigue aceptando (cara "expandir"), o que el normalizador lo traduce.
"""

import json
from dataclasses import dataclass
from pathlib import Path
from types import SimpleNamespace

from httpx import Response

PAYLOADS = Path(__file__).parent / "payloads"

# Mismo mapa que el conector del cliente: tabla local -> recurso REST.
RUTA = {
    "transactions": "/transactions",
    "accounts": "/accounts",
    "categories": "/categories",
    "payment_methods": "/payment-methods",
    "budgets": "/budgets",
    "budget_rules": "/budget-rules",
    "tags": "/tags",
    "transaction_tags": "/transaction-tags",
    "templates": "/templates",
    "recurring_rules": "/recurring",
    "exchange_rates": "/exchange-rates",
    "users": "/users",
}


@dataclass
class Escritura:
    """Una operacion en la cola del cliente, como la arma el conector."""

    tabla: str
    op: str  # PUT | PATCH | DELETE
    id: str
    datos: dict


def cargar(nombre: str) -> list[Escritura]:
    """Lee un fixture de `payloads/` y lo devuelve como lista de escrituras."""
    crudo = json.loads((PAYLOADS / nombre).read_text(encoding="utf-8"))
    return [Escritura(**e) for e in crudo]


async def reproducir_una(api: SimpleNamespace, e: Escritura) -> Response:
    """Manda una escritura por el endpoint que le corresponde. Espeja
    `conector.subir` del cliente: el mismo verbo, la misma forma del cuerpo."""
    base = "/api/v1"

    if e.tabla == "payment_method_accounts":
        # Recurso anidado: (medio, moneda) -> cuenta.
        pm = e.datos["payment_method_id"]
        return await api.client.post(
            f"{base}/payment-methods/{pm}/accounts",
            json={"id": e.id, "currency": e.datos["currency"], "account_id": e.datos["account_id"]},
        )

    ruta = RUTA[e.tabla]
    if e.op == "PUT":
        return await api.client.post(f"{base}{ruta}", json={"id": e.id, **e.datos})
    if e.op == "PATCH":
        return await api.client.patch(f"{base}{ruta}/{e.id}", json=e.datos)
    return await api.client.delete(f"{base}{ruta}/{e.id}")


async def reproducir(api: SimpleNamespace, nombre: str) -> list[tuple[Escritura, Response]]:
    """Reproduce un fixture entero, en orden. Devuelve cada escritura con su
    respuesta para poder afirmar sobre el resultado."""
    salida = []
    for e in cargar(nombre):
        salida.append((e, await reproducir_una(api, e)))
    return salida
