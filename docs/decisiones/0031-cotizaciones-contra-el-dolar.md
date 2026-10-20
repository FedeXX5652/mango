# 0031 - Cotizaciones: los dólares argentinos, la serie diaria y el dólar de cada moneda

Estado: aceptada e implementada (1.7.0). Reemplaza, en ESPECIFICACION 3.6.2, "la
fuente automática es la oficial y no se van a agregar fuentes alternativas".
Ajusta 0005 (de dónde salen las cotizaciones y cómo se eligen).
Fecha: 2026-10-12

## Contexto

Hasta la 1.6 había una sola fuente automática, exchangerate-api: el valor del
día, contra la moneda base de cada usuario, del dólar "oficial" internacional.
Tenía tres problemas:

- **No era ningún dólar que se use en Argentina.** Para el MEP o la tarjeta el
  camino era pasar la moneda a manual y cargar el valor a mano.
- **No había historia.** El planificador guardaba un dato por día desde que
  existió, y un movimiento de un día sin dato quedaba fuera del total "Global".
- **Iba contra la base de cada usuario** (EUR → ARS). Cambiar la moneda base
  dejaba la serie inservible.

Decisiones del usuario: F1 (dólar elegible por moneda; regenerar la historia;
cambiar la moneda base no obliga a regenerar nada), F2 (MEP por defecto, elegible
en Cotizaciones) y P4 (valor de **venta**; oficial, MEP, blue y tarjeta; contado
con liqui, mayorista y cripto quedan afuera).

## Decisión

### Todo contra el dólar

La serie automática guarda **solo pares contra el USD**:

- USD → ARS, uno por cada dólar argentino (`casa`: oficial, mep, blue, tarjeta);
- USD → X para las demás monedas.

Cualquier conversión se arma al leer, en el cliente:

```
A → B  =  (1 A en dólares) / (1 B en dólares)
```

Euro a pesos = euro → dólar × dólar → pesos, **con el dólar elegido para el
euro**. Cambiar la moneda base no obliga a regenerar nada.

### Fuentes

Todas gratis y sin clave (`services/fuentes_fx.py`):

| Qué | Fuente | Desde |
|---|---|---|
| USD → ARS oficial y blue | ArgentinaDatos `/cotizaciones/dolares/{casa}` | 2011 |
| USD → ARS MEP (`bolsa`) | ídem | 2018-10 |
| USD → ARS tarjeta | ídem | 2019-12 |
| USD → X, unas 30 monedas | Frankfurter (BCE) `/{desde}..{hasta}?base=USD` | 1999, días hábiles |
| USD → UYU y CLP (el BCE no las publica) | ArgentinaDatos `/cotizaciones/{moneda}` y `/usd`, oficiales del BNA del mismo día: (USD→ARS) / (X→ARS) | 2023-10 |
| El resto | exchangerate-api `latest/USD` | solo el último valor |

- Se usa la **venta**.
- Con exchangerate-api, si 1 USD vale menos de una unidad (KWD), se guarda al
  revés (1 KWD = 3,25 USD): la fuente da 6 decimales fijos y el número chico
  perdería dígitos (lo mismo que hacía 0005).

### Cuánta historia

Desde lo más viejo entre **dos años atrás** (`fx_historia_anios`) y el **primer
movimiento** de cualquier usuario: un movimiento viejo tiene que poder
convertirse. Si después se carga uno más viejo, la vuelta siguiente completa
hacia atrás.

Toda la serie baja a cada dispositivo (es compartida, ver sync-config). Con dos
años son unas 3.000 filas de los dólares y unas 500 por moneda. Por eso no se
guarda todo desde 2011: serían 17.000 filas del dólar que nadie mira, bajando a
cada teléfono.

### Cuándo se actualiza

- La tarea `cotizaciones` del planificador, **cada hora** (0029). Completa la
  historia que falte y pide lo del día. Lo de los **últimos días se corrige si
  la fuente lo cambió** (el MEP se mueve durante el día); lo viejo no se toca.
- La app la pide al abrir y con "Actualizar ahora". Al abrir, si la última vuelta
  fue hace menos de 10 minutos, no sale a la red.
- Es idempotente (`ON CONFLICT`): dos vueltas a la vez no duplican nada.
- Lo que una fuente no devuelve se informa como "sin respuesta" y la app sigue
  con lo que tenía.

### Esquema

- **`exchange_rates.casa`** (nuevo, NULL): qué dólar es una USD → ARS automática.
  CHECK con los cuatro valores; NULL en el resto.
- **`source` queda como el origen**: `'auto'` la trajo el servidor; cualquier
  otro valor es cargada a mano (`'manual'`, o la etiqueta que se elegía antes de
  la 1.7.0: oficial, mep, tarjeta). Las nuevas a mano van `'manual'`.
- El único pasa a **(par, fecha, source, casa)** con `NULLS NOT DISTINCT`.
  Aflojar un único es aditivo (0012).
- **Las automáticas viejas se dan de baja** en la migración (borrado lógico): iban
  contra la base de cada uno, y una EUR → ARS vieja le ganaría a la cuenta con el
  dólar elegido. El planificador carga la serie nueva al arrancar.
- **Las automáticas son del servidor.** El cliente no las crea, ni las corrige ni
  las borra: la serie es de todos (422 con el motivo). Para otro valor en una
  fecha se carga una a mano.
- **`users.fx_dolar`** (JSONB, NULL): el dólar de cada moneda, `{moneda: casa}`.
  NULL, o la moneda sin clave, es MEP. Viaja con la sync, como el tema.
  - La clave es **la moneda que no es el peso**: con base ARS, USD y EUR; con base
    USD y una cuenta en pesos, la del USD.
- **`users.fx_manual` sigue**: una moneda "a mano" usa solo lo cargado a mano. En
  la pantalla es una opción más del mismo selector.

### La conversión (cliente, `lib/cotizaciones`)

Para A → B a una fecha (o la última):

1. **Lo cargado a mano** para ese par, directo o al revés: lo último hasta esa
   fecha.
2. **El camino automático**, por el dólar. Si el dólar elegido no tiene dato a
   esa fecha (el MEP empieza en 2018), se usa el oficial.
3. **Gana el más nuevo; a igual fecha, lo cargado a mano.** Así lo manual gana
   en su fecha, y al día siguiente vuelve la serie.

Además:

- Si A o B están "a mano", solo 1, y si no hay par directo, componer lo cargado
  a mano por una tercera moneda (lo de antes de la 1.7.0).
- La fecha de un movimiento se lleva al **día local**: un gasto de las 22 del 31
  usa el dólar del 31, no el del 1.
- Las series se indexan por par y la búsqueda es binaria: un informe convierte
  cientos de movimientos contra miles de filas.
- Registrar un movimiento sigue sin usar la serie (0005 punto 7): manda el monto
  debitado.

### Pantalla

En Cotizaciones:

- **Una tarjeta por moneda**, con lo que vale hoy, de dónde sale (el dólar o
  "cargada a mano") y el selector **"Dólar para convertir"**: Oficial, MEP, Blue,
  Tarjeta o A mano. Si la conversión no pasa por el peso: Automática o A mano.
  Debajo, cuánto daría con cada dólar, para comparar.
- **"Evolución"**: el gráfico de la serie que se usa, con el dólar elegido. Es un
  área con degradado (DESIGN) con rango Mes, 3 meses, Año o Todo, y un resumen
  escrito (desde, hasta, variación, mínimo y máximo) que también es su texto
  para el lector de pantalla.
- **"Cargadas a mano"**: la lista para editar o borrar, y "Cargar una".

## Consecuencias

- ESPECIFICACION 3.6.2 cambia: la fuente automática deja de ser "la oficial" y
  hay fuentes alternativas.
- Migración `f991e405f7ed` (y `PowerSync` reiniciado en el deploy: `users` suma
  `fx_dolar` a la consulta).
- `POST /exchange-rates/refresh` mantiene su forma (`actualizadas`,
  `sin_cambios`, `manuales`, `fallidas`, por moneda de las cuentas del usuario),
  pero ahora actualiza la serie de todos.
- Un cliente de antes de la 1.7.0 que intente corregir o borrar una automática
  recibe 422 y el cambio va a "Rechazados" con el motivo (0011).
- El tooltip de los gráficos usa los tokens del tema (lo arregla en todos: el de
  fábrica era blanco y en oscuro no se leía).
