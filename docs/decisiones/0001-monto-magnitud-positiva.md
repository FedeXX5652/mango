# 0001 - Monto como magnitud positiva, direccion por `kind`

- **Fecha**: 2026-08-29
- **Estado**: aceptada

## Contexto

`transactions.amount` es `BIGINT` en centavos, pero nada definia el signo. El
comentario original de `schema.sql` decia que `expense` se guardaba negativo e
`income` positivo, mientras que la regla 1 de CLAUDE.md y la seccion 5.2 de la
especificacion hablan siempre de montos positivos (`2302.72 -> 230272`). No
habia ningun `CHECK` que impusiera un criterio, asi que el dato quedaba a
interpretacion de cada quien: un riesgo real de saldos calculados al reves.

## Opciones evaluadas

- **Con signo (comentario original).** `expense` negativo, `income` positivo.
  El saldo es una suma directa. Cuesta: hay que validar el signo segun `kind`
  en cada escritura, y un signo mal cargado pasa desapercibido; la ingesta
  automatica y n8n tendrian que respetar la convencion.
- **Magnitud positiva + `kind`.** `amount >= 0` siempre; la direccion la da
  `kind` (expense/income/transfer). El saldo lo calcula la consulta. Cuesta:
  ninguna suma es directa, siempre hay que ramificar por `kind`.

## Decision

Magnitud positiva. Se agrega `CONSTRAINT tx_amount_chk CHECK (amount >= 0)` y
se corrige el comentario de `schema.sql`.

## Por que

Un `CHECK` en la base es una garantia que no depende de que cada productor
(carga manual, n8n, importacion, recurrentes) recuerde la convencion de signo.
Con signo, un error no se detecta; con magnitud positiva, un negativo lo
rechaza la base. Coincide ademas con como la especificacion habla de los montos
en todos lados. Se acepta perder la comodidad de sumar directo: el calculo de
saldos siempre ramifica por `kind`.

## Consecuencias

- Todo calculo de saldo/patrimonio/estadistica ramifica por `kind`
  (`+income -expense`, transferencias mueven entre dos cuentas). Se centraliza
  en la capa de reportes (Inc 7) para no repetir la regla.
- La validacion de dominio (Inc 6) y los esquemas Pydantic exigen `amount >= 0`.
- Revertir a montos con signo obligaria a migrar toda la tabla y reinterpretar
  retroactivamente el signo de cada registro: caro. Por eso se fija ahora.
