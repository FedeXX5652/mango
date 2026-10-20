"""Borrado logico (regla 3) y DELETE idempotente (1.7.0).

Un DELETE puede llegar dos veces: dos dispositivos que borran lo mismo sin
conexion, o la sync que reintenta uno que ya se aplico. El segundo no es un
error: un 404 iria a "Rechazados" por algo que ya se hizo. Por eso los getters
aceptan `incluso_borrado` y la ruta borra solo si sigue vivo. Lo ajeno sigue en
404: el chequeo de dueno no cambia.
"""

from typing import Any

from sqlalchemy import true
from sqlalchemy.sql.elements import ColumnElement


def vivo(modelo: Any, incluso_borrado: bool = False) -> ColumnElement[bool]:
    """La condicion de "no borrado", o ninguna si se piden tambien los borrados."""
    return true() if incluso_borrado else modelo.deleted_at.is_(None)
