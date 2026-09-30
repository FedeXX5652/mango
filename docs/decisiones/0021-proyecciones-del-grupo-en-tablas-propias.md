# 0021 - Lo que baja por el grupo va a sus propias tablas locales

Estado: aceptada
Fecha: 2026-09-30

## Contexto

La auditoria de frontend (la de 0022) encontró cuatro síntomas que venían de una
sola causa:

1. **Los saldos no descontaban los gastos compartidos propios.** En el SQLite del
   dispositivo, los 9 gastos compartidos de "yo" tenían `account_id = NULL`,
   aunque en Postgres tenían cuenta. El patrimonio de Inicio salía inflado
   exactamente por lo que uno había pagado para el grupo.
2. **Las preferencias propias quedaban en `NULL`** (moneda base, tema, esquema,
   `fx_manual`) apenas la persona entraba a un grupo.
3. **Los gastos de los otros miembros aparecían en la lista personal** y en las
   estadísticas personales, como si fueran propios. Eso contradice 0014: el
   resumen personal es lo que pagó esa persona, y "los libros de plata no se
   mezclan".
4. **La cuenta conjunta mostraba un saldo distinto en cada dispositivo**: $20.000
   en el de uno cuando en la base daba $8.500. Cada miembro veía solo sus propios
   movimientos con esa cuenta.

La causa de 1 a 3: **la misma fila bajaba por dos consultas con columnas
distintas**. Por el stream `mio` llegaba completa (con la cuenta, el medio, las
notas, las preferencias). Por el stream `grupo` llegaba recortada, sin lo
privado. El cliente de PowerSync guarda **una sola copia por tabla + id** y no
hay forma de elegir cuál gana. Ganó la recortada. PowerSync lo avisa en su
documentación: una fila en varios buckets tiene que ser idéntica en todos.

La causa de 4 es otra: los movimientos de la cuenta conjunta que hacían los otros
miembros no viajaban. Las transferencias de fondeo son privadas, y en los gastos
pagados con la conjunta la cuenta venía recortada.

## Opciones evaluadas

1. **Filtrar lo propio del stream `grupo`** (`owner_id != auth.user_id()`). Es lo
   natural, pero Sync Streams no lo admite: contra un parámetro del token solo se
   puede comparar con `=` o `IN`.
2. **Columnas condicionales por usuario** ("la cuenta, si el que pide es el
   dueño"). Tampoco se puede: los datos de un bucket son iguales para todos los
   que lo reciben, y el bucket es por grupo.
3. **Separar lo privado en otra tabla de Postgres** (`transaction_private`).
   Resuelve todo del lado del servidor, pero es un cambio de esquema grande y una
   migración de datos para un problema que es de cómo se proyecta la sync.
4. **Mandar lo que baja con otra forma a OTRA tabla local**, con
   `FROM tabla AS otra_tabla` en la regla de sync. Cada tabla local recibe una
   sola forma de cada fila, y el cliente decide qué lee en cada pantalla.

## Decision

La opción 4, con una regla general: **en cada tabla local, una fila tiene una
sola forma.** Lo que el grupo necesita ver con otra forma va a una tabla propia,
de solo lectura en el cliente:

| Tabla local | Qué tiene | De dónde |
|---|---|---|
| `transactions` | **Solo lo mío, completo** | `mio` |
| `group_transactions` | El **lente** del grupo: los movimientos compartidos de todos los miembros (los míos incluidos) sin lo privado, más los movimientos de las cuentas conjuntas | `grupo` |
| `settlements` | **Todos** los pagos del grupo, sin cuenta ni medio: una copia por pago, la misma para todos | `grupo` |
| `settlement_accounts` | Lo privado de **mis** pagos (cuenta y medio), por id de pago | `mio` |
| `users` | **Mi** fila, con mis preferencias | `mio` |
| `member_profiles` | El perfil público de los miembros de mis grupos (yo incluido) | `grupo` |

Detalles que salen de esto:

- **El lente se lee con `TX_GRUPO`** (`frontend/src/lib/lente.ts`). Toma mis
  movimientos de `transactions` y los de los demás de `group_transactions`, y
  deja cada movimiento una sola vez. Usar mi copia para lo mío hace que el grupo
  refleje al instante lo que cargo sin conexión, sin esperar a que suba.
- **La cuenta conjunta viaja completa en su lado.** En `group_transactions`, la
  cuenta de un gasto pagado con la conjunta sí viene
  (`iif(paid_from_group = 1, account_id, NULL)`), porque es del grupo y no de una
  persona (0016). También viajan las transferencias que **entran** a una conjunta
  (sin la cuenta de origen) y las que **salen** (sin la de destino). Una
  transferencia entre dos cuentas conjuntas quedaría con dos formas; no hay
  ningún flujo en la app que la cree.
- **Los pagos quedan en una sola tabla para todos** porque cualquier miembro
  puede deshacer cualquier pago, y deshacer es un `DELETE` local (0017). Si los
  pagos ajenos estuvieran en otra tabla, deshacerlos no subiría nada.
- **`pago_real`** (en `settlements`) dice si el pago tuvo cuenta, sin decir cuál.
  Sirve para rotular "pago" o "saldado" en los pagos de otros. El acreedor igual
  se entera, porque le llega el cobro a confirmar (0018).
- **El saldo de una cuenta tiene una sola fórmula**: `saldoCuenta()` en
  `frontend/src/lib/saldos.ts`. Antes estaba copiada en Inicio, Metas y la cuenta
  conjunta, y Presupuesto armaba la suya: esa no descontaba los pagos reales y
  sumaba la cuenta conjunta a los fondos personales. Para una conjunta se le pasa
  el lente (`saldoCuenta(TX_GRUPO)`).

## Por que

Es la única opción que respeta a la vez las tres reglas que ya estaban decididas:

- **La privacidad (0009, 3b.2):** lo privado sigue sin salir del servidor hacia
  los demás.
- **El modelo de plata (0014):** mis cuentas se calculan solo con lo mío, y el
  grupo es un lente, no un segundo libro.
- **Offline-first:** el grupo se arma con datos locales y refleja lo que cargué
  sin conexión.

Lo que se pierde es simplicidad al leer. Una pantalla de grupo ya no puede hacer
`FROM transactions`: tiene que pasar por `TX_GRUPO`. Por eso el lente es un solo
fragmento de SQL con tests contra un SQLite de verdad, y no una consulta
repetida en cada pantalla.

## Consecuencias

- **Regla de la sync** (queda anotada como trampa 3 en `sync-config.yaml`):
  antes de sumar una consulta a un stream, fijarse si esa fila ya baja por otro
  con columnas distintas. Si baja, va a otra tabla local.
- **Las pantallas personales leen `transactions` y nada más.** Inicio,
  Movimientos, Estadísticas, Presupuesto y Metas quedan automáticamente con lo mío.
- **Las pantallas de grupo leen `TX_GRUPO`**: el resumen y el balance, la
  actividad, el presupuesto y las categorías del grupo, y la cuenta conjunta.
  Los nombres de los miembros se leen de `member_profiles`.
- Cambiar estas reglas genera una versión nueva de la sync. Los clientes vuelven
  a bajar todo solos, sin pasos a mano, y las filas ajenas que quedaron en
  `transactions` desaparecen de ahí.
- Tests: `frontend/src/lib/lente.test.ts` prueba el lente, el saldo personal (con
  pagos sincronizados, sin subir y deshechos) y el saldo de la conjunta (los
  mismos números de la auditoría: 20.000 + 15.000 − 18.000 − 6.000 − 2.500).
- Ajusta 0009 (partición), 0014 (el resumen personal vuelve a ser solo lo mío,
  como decía) y 0016 (la cuenta conjunta ahora suma lo de todos).
