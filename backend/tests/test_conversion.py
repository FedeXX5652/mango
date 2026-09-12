"""Los tres campos de una compra en otra moneda (ver 0005 y services/conversion)."""

from decimal import Decimal

import pytest

from app.services.conversion import (
    completar,
    factor,
    monto_cuenta_de,
    rate_de,
)


def test_los_dos_caminos_no_dan_lo_mismo() -> None:
    """El caso que motivo la regla: 15,80 USD debitados de una cuenta en pesos."""
    # Cargando el monto real del resumen sale una cotizacion con decimales.
    assert rate_de(1580, "USD", 2741260, "ARS") == Decimal("1734.9746835443")
    # Cargando la cotizacion redonda sale otro monto: casi dos pesos mas.
    assert monto_cuenta_de(1580, "USD", Decimal("1735.10"), "ARS") == 2741458
    # 27.414,58 contra 27.412,60: la diferencia que desajusta el saldo.
    assert 2741458 - 2741260 == 198


def test_manda_el_monto_debitado() -> None:
    # Llegan los tres y no cierran: gana `amount_account` y la cotizacion se
    # recalcula, porque es lo que figura en el resumen del banco.
    monto, rate = completar(
        amount=1580,
        moneda="USD",
        moneda_cuenta="ARS",
        amount_account=2741260,
        exchange_rate=Decimal("1735.10"),
    )
    assert monto == 2741260
    assert rate == Decimal("1734.9746835443")


def test_con_la_cotizacion_se_deduce_el_monto() -> None:
    monto, rate = completar(
        amount=1580,
        moneda="USD",
        moneda_cuenta="ARS",
        amount_account=None,
        exchange_rate=Decimal("1735.10"),
    )
    assert monto == 2741458
    assert rate == Decimal("1735.10")


def test_misma_moneda_no_guarda_conversion() -> None:
    # Guardar rate=1 seria ruido que despues hay que interpretar.
    assert completar(
        amount=100000,
        moneda="ARS",
        moneda_cuenta="ars",
        amount_account=123,
        exchange_rate=Decimal("1"),
    ) == (None, None)


def test_sin_ninguno_de_los_dos_queda_pendiente_de_dato() -> None:
    # Una compra en USD esta completa: lo que falta es un dato del banco que
    # puede llegar despues. No se inventa nada ni se marca 'pending'.
    assert completar(
        amount=1580,
        moneda="USD",
        moneda_cuenta="ARS",
        amount_account=None,
        exchange_rate=None,
    ) == (None, None)


def test_monedas_sin_decimales() -> None:
    assert factor("JPY") == 1
    assert factor("clp") == 1
    assert factor("ARS") == 100
    # 1.000 yenes a 12 pesos por yen son 12.000,00 pesos: si el factor fuera
    # 100 para el yen, el monto saldria cien veces mas chico.
    assert monto_cuenta_de(1000, "JPY", Decimal("12"), "ARS") == 1200000
    assert rate_de(1000, "JPY", 1200000, "ARS") == Decimal("12")


def test_valores_invalidos() -> None:
    with pytest.raises(ValueError):
        completar(
            amount=1580,
            moneda="USD",
            moneda_cuenta="ARS",
            amount_account=0,
            exchange_rate=None,
        )
    with pytest.raises(ValueError):
        completar(
            amount=1580,
            moneda="USD",
            moneda_cuenta="ARS",
            amount_account=None,
            exchange_rate=Decimal("0"),
        )
    with pytest.raises(ValueError):
        rate_de(0, "USD", 100, "ARS")


def test_redondeo_al_centavo() -> None:
    # 1 USD a 1735,105 son 1735,105 pesos: se redondea al centavo hacia arriba.
    assert monto_cuenta_de(100, "USD", Decimal("1735.105"), "ARS") == 173511
