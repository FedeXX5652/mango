"""Repeticion de los recordatorios (1.5.0, ver 0030): que dias vence cada uno.

El mismo motor esta en el cliente (`frontend/src/lib/repeticion.ts`) y los dos
pasan los mismos casos (`frontend/src/lib/repeticion.casos.json`): el telefono
arma el calendario sin conexion y el servidor avisa, y tienen que coincidir.

El formato es el de Samsung Reminder: no repetir, cada N dias, cada N semanas en
ciertos dias, cada N meses (el dia D, o el primero/.../ultimo de un dia de la
semana), cada N anios en la misma fecha; para siempre, N veces o hasta una
fecha. Sin feriados (decision del usuario, 2026-10-03): un vencimiento que cae
sabado o domingo se puede pasar al lunes o adelantar al viernes.

Cada ocurrencia tiene dos fechas:
- `nominal`: la que dice la regla. Identifica al ciclo (`id_ciclo`) y no cambia
  aunque despues se cambie que hacer con los fines de semana.
- `vence`: la que se muestra y se avisa, corrida por el fin de semana.
"""

import calendar
import uuid
from collections.abc import Iterator
from dataclasses import dataclass
from datetime import date, timedelta

# Mascara de dias de la semana (repeticion semanal): lunes = 1, martes = 2,
# miercoles = 4, ... domingo = 64. `date.weekday()` da 0 = lunes .. 6 = domingo.
DIAS = 7

# Espacio de nombres de los ids de ciclo (UUID v5). Es fijo: cambiarlo cambia el
# id de todos los ciclos.
ESPACIO_CICLOS = uuid.UUID("3b8f7a52-4d1e-4c6b-9a0f-2c5e8d7b1a64")

# Corrimiento maximo por fin de semana (domingo -> viernes, sabado -> lunes).
_CORRIMIENTO_MAX = timedelta(days=2)


@dataclass(frozen=True, kw_only=True)
class Regla:
    freq: str  # "once" | "daily" | "weekly" | "monthly" | "yearly"
    start_date: date
    interval_count: int = 1
    weekdays: int | None = None  # semanal: mascara (ver DIAS)
    month_mode: str | None = None  # mensual: "day" | "weekday"
    month_day: int | None = None  # mensual "day": 1..31 (si el mes es corto, el ultimo)
    month_week: int | None = None  # mensual "weekday": 1..4, o -1 = el ultimo
    month_weekday: int | None = None  # mensual "weekday": 0 = lunes .. 6 = domingo
    until_date: date | None = None
    count: int | None = None
    weekend_shift: str = "none"  # "none" | "next" | "previous"


@dataclass(frozen=True)
class Ocurrencia:
    nominal: date
    vence: date


def id_ciclo(reminder_id: uuid.UUID | str, nominal: date) -> uuid.UUID:
    """Id del ciclo: el mismo en cualquier dispositivo y en el servidor, asi dos
    que lo marcan sin conexion escriben la misma fila en vez de chocar."""
    return uuid.uuid5(ESPACIO_CICLOS, f"{str(reminder_id).lower()}:{nominal.isoformat()}")


def correr(d: date, weekend_shift: str) -> date:
    """La fecha en que vence una ocurrencia nominal, segun el fin de semana."""
    dia = d.weekday()
    if dia < 5 or weekend_shift == "none":
        return d
    if weekend_shift == "next":
        return d + timedelta(days=7 - dia)  # sabado +2, domingo +1: el lunes
    return d - timedelta(days=dia - 4)  # sabado -1, domingo -2: el viernes


def _dias_del_mes(anio: int, mes: int) -> int:
    return calendar.monthrange(anio, mes)[1]


def _en_mes(indice: int) -> tuple[int, int]:
    """Indice de mes (anio * 12 + mes - 1) a (anio, mes)."""
    return indice // 12, indice % 12 + 1


def _dia_de_semana_del_mes(anio: int, mes: int, semana: int, dia: int) -> date:
    """El primero/segundo/tercero/cuarto (1..4) o el ultimo (-1) `dia` del mes."""
    if semana == -1:
        ultimo = date(anio, mes, _dias_del_mes(anio, mes))
        return ultimo - timedelta(days=(ultimo.weekday() - dia) % DIAS)
    primero = date(anio, mes, 1)
    return primero + timedelta(days=(dia - primero.weekday()) % DIAS + DIAS * (semana - 1))


def _diarias(inicio: date, paso: int) -> Iterator[date]:
    d = inicio
    while True:
        yield d
        d += timedelta(days=paso)


def _semanales(inicio: date, paso: int, mascara: int) -> Iterator[date]:
    lunes = inicio - timedelta(days=inicio.weekday())
    while True:
        for dia in range(DIAS):
            if mascara & (1 << dia):
                d = lunes + timedelta(days=dia)
                if d >= inicio:
                    yield d
        lunes += timedelta(weeks=paso)


def _mensuales(r: Regla, inicio: date, paso: int) -> Iterator[date]:
    indice = inicio.year * 12 + inicio.month - 1
    while True:
        anio, mes = _en_mes(indice)
        if r.month_mode == "weekday":
            d = _dia_de_semana_del_mes(anio, mes, r.month_week or 1, r.month_weekday or 0)
        else:
            d = date(anio, mes, min(r.month_day or inicio.day, _dias_del_mes(anio, mes)))
        if d >= inicio:
            yield d
        indice += paso


def _anuales(inicio: date, paso: int) -> Iterator[date]:
    anio = inicio.year
    while True:
        yield date(anio, inicio.month, min(inicio.day, _dias_del_mes(anio, inicio.month)))
        anio += paso


def _candidatas(r: Regla) -> Iterator[date]:
    """Las fechas nominales que da la regla desde su inicio, en orden y sin fin
    (el corte por cantidad o fecha lo hace `nominales`). Una rama por frecuencia,
    cada una con su generador: ninguna puede seguir de largo en la de abajo."""
    inicio = r.start_date
    paso = max(r.interval_count, 1)
    if r.freq == "once":
        yield inicio
    elif r.freq == "daily":
        yield from _diarias(inicio, paso)
    elif r.freq == "weekly":
        yield from _semanales(inicio, paso, r.weekdays or (1 << inicio.weekday()))
    elif r.freq == "monthly":
        yield from _mensuales(r, inicio, paso)
    elif r.freq == "yearly":
        yield from _anuales(inicio, paso)
    else:
        raise ValueError(f"freq desconocida: {r.freq}")


def nominales(r: Regla) -> Iterator[date]:
    """Las fechas nominales con el corte de la regla (N veces o hasta una fecha)."""
    for n, d in enumerate(_candidatas(r), start=1):
        if r.until_date is not None and d > r.until_date:
            return
        yield d
        if r.count is not None and n >= r.count:
            return


def ocurrencias(r: Regla, desde: date, hasta: date) -> list[Ocurrencia]:
    """Las ocurrencias que vencen entre `desde` y `hasta` (inclusive), ordenadas
    por vencimiento."""
    salida = []
    for d in nominales(r):
        if d > hasta + _CORRIMIENTO_MAX:
            break
        vence = correr(d, r.weekend_shift)
        if desde <= vence <= hasta:
            salida.append(Ocurrencia(d, vence))
    salida.sort(key=lambda o: (o.vence, o.nominal))
    return salida


def siguiente(r: Regla, desde: date) -> Ocurrencia | None:
    """La primera ocurrencia que vence `desde` en adelante, o None si la regla ya
    termino."""
    for d in nominales(r):
        if correr(d, r.weekend_shift) >= desde:
            # Con corrimientos, una nominal cercana podria vencer antes que esta
            # (un sabado pasado al lunes y un domingo pasado al lunes): se elige
            # la primera por vencimiento entre las que estan a tiro.
            return ocurrencias(r, desde, d + 2 * _CORRIMIENTO_MAX)[0]
    return None
