"""Los tres campos de una compra en otra moneda (ver decision 0005).

Cuando la moneda del movimiento no es la de la cuenta debitada hay tres datos y
**dos cualesquiera determinan el tercero**:

    amount          el monto en la moneda del hecho (15,80 USD)
    amount_account  lo que salio de la cuenta, en SU moneda (27.412,60 ARS)
    exchange_rate   amount_account / amount, derivado

Los dos caminos NO dan lo mismo. Con una compra de 15,80 USD:

    monto real del resumen 27.412,60  ->  cotizacion deducida 1734,9747
    cotizacion 1735,10                ->  monto deducido      27.414,58

Casi dos pesos de diferencia, que acumulados desajustan el saldo contra el del
banco. **`amount_account` es la fuente de verdad**: es lo que efectivamente
salio y lo que figura en el resumen. La cotizacion se deduce y queda como dato
informativo. Si llegan los tres y no cierran, gana `amount_account`.

Ojo con los decimales: `amount` esta en unidades menores de su moneda y
`amount_account` en las de la cuenta, y no todas tienen dos (JPY y CLP tienen
cero). La cotizacion se calcula sobre unidades **mayores**, si no un yen
mediria cien veces mas de lo que vale.
"""

from decimal import ROUND_HALF_UP, Decimal

# Escala de la cotizacion: la de la columna NUMERIC(20,10).
DECIMALES_RATE = Decimal("0.0000000001")

# Monedas sin decimales. La lista corta alcanza: son las que existen en la
# practica y el resto del mundo usa dos. El cliente lo resuelve con `Intl`; aca
# no hay una tabla ISO disponible sin sumar una dependencia.
SIN_DECIMALES = frozenset({"JPY", "KRW", "CLP", "ISK", "VND", "PYG", "UGX", "RWF", "XAF", "XOF"})


def factor(moneda: str) -> int:
    """Cuantas unidades menores tiene una unidad mayor."""
    return 1 if moneda.strip().upper() in SIN_DECIMALES else 100


def rate_de(amount: int, moneda: str, amount_account: int, moneda_cuenta: str) -> Decimal:
    """Cotizacion implicita: cuantas unidades de la moneda de la cuenta compra
    una unidad de la moneda del movimiento."""
    if amount <= 0:
        raise ValueError("amount debe ser positivo para deducir la cotizacion")
    mayores = Decimal(amount) / Decimal(factor(moneda))
    mayores_cuenta = Decimal(amount_account) / Decimal(factor(moneda_cuenta))
    return (mayores_cuenta / mayores).quantize(DECIMALES_RATE, rounding=ROUND_HALF_UP)


def monto_cuenta_de(amount: int, moneda: str, rate: Decimal, moneda_cuenta: str) -> int:
    """Monto debitado que implica una cotizacion, en unidades menores de la
    moneda de la cuenta. Redondea al centavo: es plata, no puede quedar en
    fracciones."""
    mayores = Decimal(amount) / Decimal(factor(moneda))
    total = mayores * rate * Decimal(factor(moneda_cuenta))
    return int(total.quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def completar(
    *,
    amount: int,
    moneda: str,
    moneda_cuenta: str,
    amount_account: int | None,
    exchange_rate: Decimal | None,
) -> tuple[int | None, Decimal | None]:
    """Devuelve `(amount_account, exchange_rate)` completos y coherentes.

    - Misma moneda: los dos van en NULL. No hay conversion que registrar, y
      guardar `rate=1` seria ruido que despues hay que interpretar.
    - Con `amount_account`: manda el, y la cotizacion se recalcula (aunque
      hubiera venido otra).
    - Solo con la cotizacion: se deduce el monto debitado.
    - Sin ninguno de los dos: quedan en NULL. El movimiento **es valido**: una
      compra en USD esta completa, lo que falta es un dato derivado del banco
      que puede llegar despues (ver 0005; NO se marca 'pending', regla 4).
    """
    if moneda.strip().upper() == moneda_cuenta.strip().upper():
        return None, None

    if amount_account is not None:
        if amount_account <= 0:
            raise ValueError("El monto debitado debe ser positivo")
        return amount_account, rate_de(amount, moneda, amount_account, moneda_cuenta)

    if exchange_rate is not None:
        if exchange_rate <= 0:
            raise ValueError("La cotizacion debe ser positiva")
        return monto_cuenta_de(amount, moneda, exchange_rate, moneda_cuenta), exchange_rate

    return None, None
