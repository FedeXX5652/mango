"""Que avisar y cuando, del calendario de pagos (0030, etapa 2). Logica pura."""

from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from app.services.recordatorios import (
    Aviso,
    EstadoCiclo,
    avisos_debidos,
    corrido_al_horario,
    texto,
)
from app.services.repeticion import Regla

TZ = ZoneInfo("America/Argentina/Buenos_Aires")
# El 10 de cada mes; octubre 2026 cae sabado y pasa al lunes 12.
ALQUILER = Regla(
    freq="monthly",
    month_mode="day",
    month_day=10,
    start_date=date(2026, 1, 10),
    weekend_shift="next",
)
OCT = date(2026, 10, 10)
DEL_DIA = [{"days_before": 0, "time": "09:00"}]


def _a(dia: int, hora: int, minuto: int = 0, mes: int = 10) -> datetime:
    return datetime(2026, mes, dia, hora, minuto, tzinfo=TZ)


def _debidos(ahora, alerts=DEL_DIA, followup=3, ciclos=None, desde=date(2026, 10, 1)):
    return avisos_debidos(ALQUILER, alerts, followup, desde, ciclos or {}, ahora)


def test_avisa_el_dia_a_su_hora() -> None:
    assert _debidos(_a(12, 8, 59)) == []
    assert _debidos(_a(12, 9)) == [Aviso(OCT, date(2026, 10, 12), "aviso", "0@09:00")]


def test_lo_que_se_perdio_a_la_hora_sale_mas_tarde_el_mismo_dia() -> None:
    # El servidor estuvo apagado a las 9: a las 15 todavia sale.
    assert [a.clave for a in _debidos(_a(12, 15))] == ["0@09:00"]


def test_un_aviso_no_se_repite() -> None:
    ciclos = {OCT: EstadoCiclo(alerts_sent={"0@09:00"})}
    assert _debidos(_a(12, 10), ciclos=ciclos) == []


def test_avisos_con_anticipacion() -> None:
    alerts = [{"days_before": 3, "time": "09:00"}, {"days_before": 0, "time": "18:30"}]
    # 3 dias antes del vencimiento corrido (lunes 12): el viernes 9.
    assert [a.clave for a in _debidos(_a(9, 10), alerts=alerts)] == ["3@09:00"]
    assert [a.clave for a in _debidos(_a(12, 18, 30), alerts=alerts)] == ["0@18:30"]


def test_nunca_entre_las_22_y_las_8() -> None:
    assert _debidos(_a(12, 22, 0)) == []
    assert _debidos(_a(12, 7, 59)) == []


def test_seguimiento_diario_hasta_el_limite() -> None:
    # Vencio el lunes 12 y no se respondio.
    assert [(a.clase, a.clave) for a in _debidos(_a(13, 9, 5))] == [("seguimiento", "2026-10-13")]
    # Una vez por dia.
    ciclos = {OCT: EstadoCiclo(followup_sent_on=date(2026, 10, 13))}
    assert _debidos(_a(13, 15), ciclos=ciclos) == []
    # Tres dias: el 15 si, el 16 ya no.
    assert len(_debidos(_a(15, 9))) == 1
    assert _debidos(_a(16, 9)) == []
    # 0 = no seguir; None = hasta que responda.
    assert _debidos(_a(13, 9), followup=0) == []
    assert [a.clase for a in _debidos(_a(30, 9), followup=None)] == ["seguimiento"]


def test_seguimiento_a_la_hora_del_primer_aviso() -> None:
    alerts = [{"days_before": 1, "time": "18:00"}, {"days_before": 0, "time": "10:30"}]
    assert _debidos(_a(13, 10), alerts=alerts) == []
    assert [a.clase for a in _debidos(_a(13, 10, 30), alerts=alerts)] == ["seguimiento"]


def test_lo_respondido_no_avisa() -> None:
    for estado in ("paid", "skipped"):
        ciclos = {OCT: EstadoCiclo(status=estado)}
        assert _debidos(_a(12, 9), ciclos=ciclos) == []
        assert _debidos(_a(13, 9), ciclos=ciclos) == []


def test_mas_tarde_calla_hasta_su_hora_y_avisa_una_vez() -> None:
    hasta = _a(12, 15)
    ciclos = {OCT: EstadoCiclo(snoozed_until=hasta)}
    assert _debidos(_a(12, 9), ciclos=ciclos) == []
    assert _debidos(_a(12, 14, 59), ciclos=ciclos) == []
    assert [(a.clase, a.vence) for a in _debidos(_a(12, 15), ciclos=ciclos)] == [
        ("pospuesto", date(2026, 10, 12))
    ]


def test_lo_pospuesto_avisa_aunque_no_tenga_avisos() -> None:
    ciclos = {OCT: EstadoCiclo(snoozed_until=_a(12, 15))}
    assert [a.clase for a in _debidos(_a(12, 16), alerts=[], ciclos=ciclos)] == ["pospuesto"]
    # Sin avisos y sin posponer: no avisa nunca.
    assert _debidos(_a(12, 9), alerts=[]) == []
    assert _debidos(_a(13, 9), alerts=[]) == []


def test_lo_vencido_cuenta_desde_track_from() -> None:
    # La regla se cambio el 14: el vencimiento del 12 no se sigue.
    assert _debidos(_a(14, 9), desde=date(2026, 10, 14)) == []


def test_mas_tarde_nunca_cae_de_madrugada() -> None:
    assert corrido_al_horario(_a(12, 23, 30)) == _a(13, 8)
    assert corrido_al_horario(_a(12, 6)) == _a(12, 8)
    assert corrido_al_horario(_a(12, 10, 15)) == _a(12, 10, 15)


def test_el_texto_dice_cuando_y_cuanto() -> None:
    hoy = date(2026, 10, 12)
    aviso = Aviso(OCT, hoy, "aviso", "0@09:00")
    assert texto(aviso, hoy, "$ 500.000,00") == "Vence hoy · $ 500.000,00"
    assert texto(aviso, hoy - timedelta(days=1), None) == "Vence mañana"
    assert texto(aviso, hoy - timedelta(days=3), None) == "Vence el lunes 12/10"
    assert texto(aviso, hoy + timedelta(days=1), None) == "Venció el lunes 12/10. ¿Ya lo pagaste?"
    pospuesto = Aviso(OCT, hoy, "pospuesto", "pospuesto")
    assert texto(pospuesto, hoy, None) == "Te lo recuerdo: vence hoy"
