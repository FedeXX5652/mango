# 0034 - La tarjeta de crédito es una cuenta; adiós a los medios de pago

Estado: aceptada (1.11.0).
Fecha: 2026-10-30

## Contexto

La especificación (3.3) separaba **cuenta** (dónde está la plata) y **medio de
pago** (con qué se paga) como una distinción central. En el uso real el medio
solo aportaba en las tarjetas de crédito: una tarjeta de débito es la cuenta
misma, y lo único que tenía el medio que la cuenta no tenía eran los datos de la
tarjeta (cierre, vencimiento, últimos 4).

Tener dos conceptos para una tarjeta produjo el error que motivó esta decisión:
gastos hechos con la tarjeta de crédito (el medio) quedaron cargados en la
cuenta del banco, y el saldo del banco dejó de coincidir con el extracto, porque
el banco recién debita esos consumos cuando se paga el resumen. Los datos de la
tarjeta estaban en el medio y la deuda en otra cuenta: nada los unía.

Decisión del usuario (2026-10-30): la tarjeta de crédito es un tipo de cuenta
con comportamiento propio, y los medios de pago se van.

## Decisión

### 1. La tarjeta es una cuenta con sus datos

Una cuenta `credit_card` guarda lo que antes estaba en el medio, más el límite:

- `brand` y `last4`: "Visa ···1234". Para reconocerla, y para la ingesta (fase 2).
- `closing_day` y `due_day`: día de cierre y de vencimiento del resumen (1 a 31;
  un día que el mes no tiene cae en el último).
- `credit_limit`: el límite de compra, opcional, en centavos de la moneda de la
  cuenta.

Las columnas son de `accounts` y solo valen en una tarjeta: en otro tipo quedan
en NULL (lo impone la base).

### 2. Una tarjeta, un saldo por moneda

Una tarjeta argentina tiene saldo en pesos y saldo en dólares, y cada uno se paga
por separado. Cada **cuenta** sigue teniendo **una sola moneda** (0005): el saldo
en dólares es otra cuenta `credit_card` con `parent_account_id` apuntando a la
principal. La interfaz las muestra como **una sola tarjeta con dos saldos**; los
datos de la tarjeta (marca, cierre, vencimiento, límite) están solo en la
principal y el saldo secundario los hereda.

- Un saldo secundario no tiene saldo secundario propio, es de otra moneda que la
  principal y hay a lo sumo uno por moneda.
- Al cargar un gasto con la tarjeta en la moneda de un saldo secundario, va a ese
  saldo. En una moneda sin saldo propio se carga como siempre: el monto en su
  moneda y el monto debitado en la de la cuenta (0005).

### 3. Pagar la tarjeta: desde cualquier cuenta, todo o una parte

El pago del resumen sigue siendo una **transferencia** hacia la tarjeta, nunca un
gasto (3.6: si no, se cuenta dos veces). La tarjeta **no tiene una cuenta de pago
fija**: se paga desde cualquiera. Los pesos desde el banco en pesos y los dólares
desde la cuenta en dólares, o los dólares con pesos.

- Se paga **un saldo a la vez** (pesos o dólares). La calculadora arranca en lo
  que se debe de ese saldo y se puede cambiar para pagar una parte.
- "Desde" sugiere la cuenta del último pago de ese saldo; si no hubo, la primera
  cuenta activa en esa moneda.
- Pagar dólares con pesos es una transferencia entre monedas (0005): `amount` en
  la moneda de la tarjeta, `amount_account` en la de la cuenta de origen. La app
  propone el monto en pesos con el dólar tarjeta (0031) y se puede corregir con lo
  que de verdad debitó el banco.

### 4. Compras en cuotas

`transactions.installments` (NULL = una sola). Solo en un gasto de una tarjeta.

- **La compra es una sola**, por el total: consume el sobre y suma en las
  estadísticas en su fecha, entera. Es lo que ya decía 3.6 para cualquier gasto
  con tarjeta ("comprometiste esa plata, aunque todavía no salió de la cuenta").
- **Las cuotas solo dicen cuándo se factura cada parte**: la cuota 1 entra en el
  cierre en o después de la compra (el día del cierre entra), la 2 en el
  siguiente, y así. Son cuotas iguales que suman exacto: la primera lleva los
  centavos que sobran, como en el resumen del banco.
- La deuda de la tarjeta es el total desde el día de la compra, como en el banco:
  las cuotas futuras también ocupan el límite.

### 5. El resumen se calcula, no se guarda

Lo que vence es la deuda total menos lo que todavía no se facturó: las compras
posteriores al último cierre y las cuotas futuras de las anteriores. Si da cero
o menos, el resumen está pagado.

- Los pagos ya hechos bajan la deuda total, así que se descuentan solos.
- No conoce intereses ni cargos del banco: esos entran con "Ajustar saldo" (0033)
  y cuentan como facturados en su fecha.
- Sin día de cierre cargado no hay resumen: solo el total.

### 6. Límite y disponible

Disponible = límite − deuda del saldo principal − deuda de los otros saldos
convertida con el dólar tarjeta (0031). Es informativo: no bloquea un gasto.

### 7. Vencimiento y avisos

"Avisarme" de una tarjeta sigue a su **cuenta**: `reminders.account_id`, que
reemplaza a `payment_method_id`. Si la tarjeta cambia su día de vencimiento, el
recordatorio lo sigue (como en 1.6.0). El recordatorio de una tarjeta ofrece
**"Pagar"**, que abre la hoja de pago de esa tarjeta.

### 8. Los medios de pago se van, en dos pasos (0012)

- **1.11.0 (expandir).**
  - **Columnas nuevas, todas opcionales:** `accounts.brand`, `last4`,
    `closing_day`, `due_day`, `credit_limit`, `parent_account_id`;
    `transactions.installments`; `reminders.account_id`.
  - **La migración pasa cada medio de tipo tarjeta de crédito a su cuenta.** La
    cuenta sale de este orden: la de `default_account_id`; si no, la tarjeta
    asociada; si no, la tarjeta donde están sus movimientos. Copia los datos de
    la tarjeta (sin pisar lo que la cuenta ya tenga) y le pasa sus recordatorios.
  - **La interfaz deja de mostrar y de escribir medios de pago.**
  - **El servidor sigue aceptando** `payment_method_id` y las rutas de medios de
    pago, que es lo que manda un cliente 1.10.
- **Contraer (una versión posterior, sin clientes 1.10).** Se borran
  `payment_methods`, `payment_method_accounts` y las columnas
  `payment_method_id`.
- **Los últimos 4 de una tarjeta de débito**, que la ingesta (fase 2) necesita
  para saber de qué cuenta salió una compra, van a ir en la cuenta del banco
  cuando llegue la ingesta.

## Consecuencias

- La cuenta de la tarjeta cuadra con el resumen y la del banco con el extracto,
  cada una por su lado.
- Ya no se registra si una compra se pagó con débito o con transferencia: las dos
  salen de la misma cuenta, que es lo que importa para el saldo.
- La distinción central de 3.3 cambia: la especificación se reescribe.
- Un cliente viejo (1.10) sigue viendo los medios de pago hasta que se actualiza;
  lo que cargue con un medio sigue entrando. La PWA se actualiza sola (0028).
