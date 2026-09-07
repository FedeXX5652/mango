# 0005 - Multimoneda: presupuesto por moneda, patrimonio convertido y tipo de cambio por movimiento

- **Fecha**: 2026-09-07
- **Estado**: aceptada

## Contexto

El esquema soporta varias monedas desde el principio (`accounts.currency`,
`transactions.currency`, `amount_account`, `exchange_rate`, `exchange_rates`,
`users.base_currency`), pero la aplicacion asumia una sola: los informes sumaban
`amount` sin mirar la moneda, y el presupuesto tambien.

Apenas aparecio una cuenta en dolares el problema se vio de frente: "Ingresos
del mes" mostraba `$ 1.000.500` cuando eran 1.000.000 de pesos **mas** 500
dolares. Un numero que no significa nada, en la pantalla principal.

Esto adelanta multimoneda, que estaba en fase 4.

## Opciones evaluadas

**Dejar las cuentas en otra moneda afuera del presupuesto.** Simple: el
presupuesto vive solo en la moneda base. Cuesta lo que importa: no se pueden
presupuestar los ahorros en dolares, que es un caso real y no hipotetico. Y
comprar dolares queda raro (consumiria un sobre en pesos, cuando no se gasto
plata: se cambio de forma).

**Convertir todo a la moneda base y presupuestar ahi.** Un solo presupuesto,
pero cada movimiento en otra moneda depende de una cotizacion, el presupuesto
cambia cuando cambia el dolar y "cuanto me queda del sobre" pasa a ser una
estimacion. Inaceptable para un sobre, que es un compromiso concreto.

**Un presupuesto por moneda.** Mas interfaz (hay que elegir la moneda) y
`currency` entra en la clave de los sobres. En cambio no necesita ninguna
cotizacion y cada numero es exacto.

## Decision

### 1. Un presupuesto por moneda, con su propio "por asignar"

```
por_asignar(moneda) = saldo de cuentas presupuestables EN esa moneda
                      - suma de lo asignado a sobres EN esa moneda
```

El invariante se cumple **por moneda**, cada una por separado. La interfaz
permite cambiar entre monedas y muestra solo las que tienen cuentas
presupuestables.

**El sobre es categoria + moneda + mes.** Una misma categoria puede tener sobre
en pesos y en dolares: `Viaje 2027` en pesos para lo local, en dolares para los
pasajes. El arbol de categorias es uno solo, compartido entre monedas.

**Un movimiento consume del sobre de su categoria exacta, en su moneda.** Sin
conversion en ningun lado.

Por eso `currency` entra en las claves unicas:

```
budgets_uniq       (owner_id, group_id, category_id, currency, period_start)
budget_rules_uniq  (owner_id, group_id, category_id, currency)
```

Comprar dolares es **una transferencia entre dos cuentas presupuestables**: no
consume ningun sobre, baja "por asignar" en pesos y sube en dolares. Si la plata
estaba comprometida a sobres, "por asignar" en pesos queda negativo y avisa. Eso
es informacion correcta, no un error.

### 1.1 El patrimonio es la excepcion: ahi si se convierte

El patrimonio tiene **dos vistas** en la misma tarjeta:

- **Global**: todo en una sola moneda, convertido con la ultima cotizacion
  conocida, con un selector para verlo en cualquiera de las monedas que el
  usuario tiene y **la fecha del dato a la vista**. Es una valuacion: fluctua.
- **Por moneda**: el saldo de cada moneda por separado, sin convertir. Es el
  numero exacto, y el que contesta "cuantos dolares tengo".

La eleccion de vista y de moneda se guarda **por dispositivo**: es una
preferencia de lectura, no un dato del usuario que deba sincronizarse.

Si falta la cotizacion de una moneda, ese saldo **no entra en el total** y la
tarjeta lo dice, con salida a cargarla. Un total que incluye una conversion
inventada es peor que un total incompleto.

### 1.2 En el resumen, UNA sola cotizacion: la ultima

El patrimonio y los flujos de la tarjeta usan **la misma** cotizacion, la ultima
conocida. La tarjeta contesta "cuanto tengo y como vino el mes, expresado en
esta moneda, **hoy**": es como si cambiaras todo ahora, a la cotizacion de
ahora. Que el patrimonio usara una y los flujos otra mezclaria dos valuaciones
en el mismo bloque.

La cotizacion **del momento de cada movimiento** responde otra pregunta —
"cuanto me costo en marzo", que no puede cambiar porque hoy salto el dolar — y
por eso vive en los **informes historicos** (Estadisticas), con
`transactions.exchange_rate` como fuente y la serie por fecha como respaldo.

| Pregunta | Cotizacion |
|---|---|
| Resumen: cuanto tengo y como vino el mes, en una moneda | **la ultima** |
| Informe historico: cuanto gaste en marzo | **la del momento** |

Consecuencia buena: **el resumen no necesita avisos de fechas faltantes**. Con
una sola cotizacion por par no hay "falta la del 04/09"; lo unico que puede
faltar es la cotizacion de una moneda, y entonces esa queda afuera del total y
se dice, con salida a cargarla.

Esto reemplaza dos intentos anteriores —convertir cada flujo con la cotizacion
de su dia, y despues aproximar con la mas cercana avisando— que resolvian un
problema que esta tarjeta no tiene. Quedan anotados porque la logica por fecha
si va a hacer falta en los informes historicos.

### 2. Los demas informes se leen en una moneda a la vez

Mientras no haya cotizaciones, **ningun informe suma monedas distintas ni
convierte**: elige una moneda (la base por defecto), filtra por ella y lo dice
en pantalla. Vale para Estadisticas, los tres datos del mes en Inicio y el neto
por dia del calendario.

### 3. La cotizacion correcta depende de la pregunta

| Pregunta | Cotizacion | Por que |
|---|---|---|
| Cuanto vale mi patrimonio hoy | **actual** | Si tenes dolares y el dolar sube, sos mas rico. Debe fluctuar. |
| Cuanto gaste en marzo | **la del momento de cada movimiento** | Lo gastado en marzo no puede cambiar porque el dolar se movio en agosto. |

`transactions.exchange_rate` conserva la de cada movimiento; `exchange_rates`
guarda la serie para el patrimonio. Se convierte siempre desde la moneda de
origen a la moneda principal del usuario.

#### De donde salen las cotizaciones

**Automatico, con una API publica.** `api.exchangerate-api.com/v4/latest/{CODE}`:
gratuita, sin clave, y publica **una cotizacion por dia** (trae `date` en el
payload). Se pide **una llamada por moneda** —`/latest/{extranjera}`, leyendo
`rates[base]`— y no una sola a `/latest/{base}` dando vuelta el numero: la API
redondea a ~6 digitos y el inverso arrastra ese error. Ademas asi la fila queda
en la direccion en que se lee ("1 USD = 1735,10 ARS"). Son una o dos monedas en
la practica.

**Sin cron ni timers.** El refresco se dispara **al abrir la app**, junto con
las recurrentes (`POST /exchange-rates/refresh`), y hay un boton para forzarlo
en Ajustes > Cotizaciones. El servidor no siempre esta prendido, asi que un cron
se saltearia dias igual; y como la fuente publica una por dia, el refresco es
**idempotente por fecha**: llamarlo de mas no gasta nada. Si la fuente falla o
no hay conexion, las monedas salen en `fallidas` y la app sigue con lo que tenia.

**Cada moneda puede quedar fuera del automatico** (`users.fx_manual`). Es
necesario, no un lujo: para ARS esta API publica la **oficial**, que no es la que
uno paga (MEP, tarjeta). La pantalla muestra un interruptor por moneda y dice
cual esta en automatico y cual a mano.

**A igual fecha, lo cargado a mano gana.** Si el usuario tipeo una cotizacion es
porque la oficial no es la que aplica. El orden es
`rate_date DESC, (source='auto') ASC, created_at DESC`, y esta escrito **en las
dos puntas**: en `crud.fx.latest_rate` y en la consulta del cliente. Si estuviera
en una sola, el servidor y la pantalla mostrarian numeros distintos.

`source` guarda de donde vino cada fila: `auto` la que trae la API, y el texto
que elija el usuario (`oficial`, `mep`, `tarjeta`) las que carga a mano.

### 4. Que campo lleva que moneda

- `amount` + `currency`: el monto en la moneda **del hecho** (la compra, o lo que
  entra a la cuenta destino en una transferencia).
- `amount_account`: el mismo hecho en la moneda de **`account_id`**, la cuenta
  debitada.
- `exchange_rate = amount_account / amount`, **derivado**.

| Caso | amount / currency | amount_account | account_id |
|---|---|---|---|
| Compra 15,80 USD con tarjeta en pesos | 1580 USD | 2741260 ARS | cuenta ARS |
| Compra de dolares: 100.000 ARS -> 57,63 USD | 5763 USD | 10000000 ARS | cuenta ARS (origen) |

**En una transferencia entre monedas, `transactions.currency` termina siendo la
moneda de DESTINO, no la de origen.** Es consistente con la regla ("`amount`
esta en la otra moneda, `amount_account` en la de la cuenta debitada") y hace que
la cuenta que recibe acredite `amount`, que ya esta en su moneda. Pero es
contraintuitivo: queda escrito para que nadie lo "corrija".

Consecuencia directa: **los saldos tienen que restar `COALESCE(amount_account,
amount)` del lado `account_id`**. Restar `amount` descuadra la cuenta en pesos
cuando la transferencia cruza monedas.

Direccion de la cotizacion en `exchange_rates`: `rate` es **cuantas unidades de
`quote_currency` compra 1 de `base_currency`**. El dolar oficial se guarda
`base='USD'`, `quote='ARS'`, `rate=1735.10`.

**No hace falta cargar las dos direcciones**: si se necesita ARS -> USD y solo
existe USD -> ARS, se usa `1/rate`. Es la misma cotizacion leida al reves, no un
dato nuevo.

### 5. Cuando hay redondeo, manda el monto debitado

Los dos caminos no dan lo mismo. Con una compra de 15,80 USD:

- monto real del resumen 27.412,60 -> cotizacion deducida 1734,9747
- cotizacion 1735,10 -> monto deducido 27.414,58

Casi dos pesos de diferencia; acumulado sobre cientos de movimientos desajusta
el saldo contra el del banco. **El monto debitado es la fuente de verdad**,
porque es lo que efectivamente salio y lo que figura en el resumen; la
cotizacion se deduce y queda como dato informativo. La interfaz prefiere que se
cargue el monto, aunque acepte lo otro.

**Al editar**: si se edita `amount`, se recalcula `exchange_rate` y
`amount_account` no se toca. Si se edita `amount_account`, se recalcula la
cotizacion.

### 6. Cuando todavia no se sabe la cotizacion

Una compra en el exterior aparece antes del resumen. Si **llego por la ingesta**
queda `pending` con motivo `no_exchange_rate`, que es para lo que se diseno la
bandeja de pendientes.

Si la **carga es manual**, se guarda `confirmed` con `amount_account` y
`exchange_rate` en NULL, y aparece en un filtro "faltan datos de conversion".
**No se toca la regla 4** (`pending` solo lo produce la ingesta automatica, y la
base lo impone con `tx_pending_source_chk`): una compra manual en USD **esta
completa**; lo que falta es un dato derivado del banco, no del movimiento.

### 7. La cache de cotizaciones sirve para estimar, nunca para registrar

`exchange_rates` es una tabla del esquema y PowerSync la replica al SQLite del
dispositivo: esa copia local **es** la cache, no hace falta nada nuevo salvo
incluirla en las reglas de sincronizacion (y darle `updated_at`/`deleted_at`,
que hoy no tiene y son obligatorias para sincronizar).

- Mostrar patrimonio con la ultima cotizacion conocida esta bien, **con la fecha
  a la vista** para saber si esta vieja.
- Registrar un movimiento exige la cotizacion real. Si no se sabe, ver el punto 6.

### 8. Codigos de moneda y decimales

**ISO 4217, tres letras** (ARS, USD, EUR, BRL): los de dos letras son codigos de
pais y no coinciden, y `CHAR(3)` ya esta en todo el esquema.

**La cantidad de decimales depende de la moneda**: 2 en ARS, USD o BRL; **0 en
JPY y CLP**. La conversion entre unidad mayor y menor usa el exponente de la
moneda (`Intl`), no un 100 fijo. Con las monedas de hoy siempre da 2, pero si
entra JPY, dividir por 100 daria montos cien veces menores.

Las reglas de presentacion (cuando se muestra el codigo, como se atenua, columna
de simbolo en listas) estan en `DESIGN.md` seccion 7.

## Por que

Se acepta **mas interfaz** (elegir moneda en presupuesto e informes) y una clave
mas larga en `budgets` a cambio de que ningun numero dependa de una cotizacion
cuando no hace falta. El presupuesto es un compromiso: tiene que ser exacto. El
patrimonio es una valuacion: tiene que fluctuar. Son preguntas distintas y por
eso usan cotizaciones distintas.

Tambien se acepta que el informe **no explique todo el gasto** cuando hay varias
monedas: mostrar una moneda a la vez y decirlo es preferible a un total que
mezcla, y a una conversion inventada.

## Consecuencias

- `budgets` y `budget_rules` cambian de clave unica: hay que migrar los indices.
- Los saldos de cuenta pasan a depender de `amount_account` en las
  transferencias entre monedas.
- `exchange_rates` necesita `updated_at`/`deleted_at`, CRUD, endpoint, entrada en
  `sync-rules.yaml`, tabla en el `AppSchema` del cliente y ruta en el conector.
  Una tabla que no este en las tres listas no llega al dispositivo.
- La ingesta automatica (fase 2) tiene que poder dejar un movimiento pendiente
  por `no_exchange_rate` y completarlo despues.
- Revertir a monomoneda seria facil en la interfaz y dificil en los datos: una
  vez que hay sobres en dos monedas, colapsarlos exige elegir una cotizacion.
