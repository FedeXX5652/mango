"""Avisos del calendario de pagos (1.5.0, etapa 2, ver 0030): que avisar y cuando.

La parte pura: dado un recordatorio, lo que paso con sus vencimientos y la hora
local, que avisos tocan ahora. La tarea del planificador
(`planificador.avisar_recordatorios`) los manda y anota.

Las reglas (decisiones del usuario, C7/R2/R4):
- Cada vencimiento avisa en sus `alerts` ({days_before, time}): el dia y la hora
  locales. Si el servidor estuvo apagado a esa hora, sale cuando vuelve, pero solo
  el mismo dia: lo de dias anteriores lo cubre el seguimiento.
- Vencido y sin responder, se sigue avisando una vez por dia, a la hora del
  primer aviso, durante `followup_days` dias (NULL = hasta que se responda).
- "Mas tarde" (`snoozed_until`) calla ese vencimiento hasta esa hora; ahi avisa
  una vez.
- A cualquier hora: la hora la elige la persona (2026-10-08, se saco la franja
  de 8 a 22 de la 1.5.0).
- Un recordatorio sin avisos no avisa (solo se ve en el calendario), salvo lo que
  la persona pospuso a proposito.
"""

from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta

from app.services.repeticion import Regla, correr, ocurrencias

# Hasta cuanto para atras se mira el seguimiento "hasta que responda": un
# recordatorio olvidado hace meses no tiene que recorrer años de fechas.
_SEGUIMIENTO_MAX = timedelta(days=366)

_DIAS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]


@dataclass
class EstadoCiclo:
    """Lo que el servidor sabe de un vencimiento (la fila de reminder_cycles)."""

    status: str = "pending"
    snoozed_until: datetime | None = None
    # Avisos ya mandados de este vencimiento: "3@09:00" (dias antes @ hora).
    alerts_sent: set[str] = field(default_factory=set)
    followup_sent_on: date | None = None


@dataclass(frozen=True)
class Aviso:
    nominal: date
    vence: date
    clase: str  # "aviso" | "seguimiento" | "pospuesto"
    # Para no repetirlo: la clave del aviso ("3@09:00") o la fecha del seguimiento.
    clave: str


def _hora(texto: str) -> time:
    return time.fromisoformat(texto)


def avisos_debidos(
    regla: Regla,
    alerts: list[dict],
    followup_days: int | None,
    track_from: date,
    ciclos: dict[date, EstadoCiclo],
    ahora: datetime,
) -> list[Aviso]:
    """Los avisos que tocan `ahora` (hora local, con zona) para un recordatorio.
    `ciclos` va por fecha nominal."""
    hoy = ahora.date()
    salida: list[Aviso] = []

    # Lo pospuesto: avisa una vez cuando se cumple, tenga o no avisos propios.
    for nominal, c in ciclos.items():
        if c.status == "pending" and c.snoozed_until is not None and c.snoozed_until <= ahora:
            vence = _vence_de(regla, nominal)
            salida.append(Aviso(nominal, vence, "pospuesto", "pospuesto"))

    if not alerts:
        return salida
    anticipacion = max(a["days_before"] for a in alerts)
    primera_hora = min(_hora(a["time"]) for a in alerts)
    atras = timedelta(days=followup_days) if followup_days is not None else _SEGUIMIENTO_MAX
    desde = max(track_from, hoy - atras)
    pospuestos = {a.nominal for a in salida}

    for o in ocurrencias(regla, desde, hoy + timedelta(days=anticipacion)):
        c = ciclos.get(o.nominal, EstadoCiclo())
        if c.status != "pending" or o.nominal in pospuestos:
            continue
        if c.snoozed_until is not None and c.snoozed_until > ahora:
            continue  # pospuesto: calla hasta esa hora
        if o.vence >= hoy:
            for a in alerts:
                if o.vence - timedelta(days=a["days_before"]) != hoy:
                    continue
                if ahora.time() < _hora(a["time"]):
                    continue
                clave = f"{a['days_before']}@{a['time']}"
                if clave not in c.alerts_sent:
                    salida.append(Aviso(o.nominal, o.vence, "aviso", clave))
        else:
            # Vencido y sin responder: uno por dia, a la hora del primer aviso.
            if followup_days is not None and (hoy - o.vence).days > followup_days:
                continue
            if c.followup_sent_on == hoy or ahora.time() < primera_hora:
                continue
            salida.append(Aviso(o.nominal, o.vence, "seguimiento", hoy.isoformat()))
    return salida


def _vence_de(regla: Regla, nominal: date) -> date:
    return correr(nominal, regla.weekend_shift)


def _dia(d: date) -> str:
    """ "lunes 12/10/2026": las fechas van siempre como dd/mm/aaaa."""
    return f"{_DIAS[d.weekday()]} {d.day:02d}/{d.month:02d}/{d.year}"


def texto(aviso: Aviso, hoy: date, monto: str | None) -> str:
    """El cuerpo del aviso: cuando vence (o vencio) y cuanto, si se sabe."""
    dias = (aviso.vence - hoy).days
    if dias < 0:
        base = f"Venció el {_dia(aviso.vence)}. ¿Ya lo pagaste?"
    elif dias == 0:
        base = "Vence hoy"
    elif dias == 1:
        base = "Vence mañana"
    else:
        base = f"Vence el {_dia(aviso.vence)}"
    if aviso.clase == "pospuesto":
        base = f"Te lo recuerdo: {base[0].lower()}{base[1:]}"
    return f"{base} · {monto}" if monto else base
