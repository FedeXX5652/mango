# 0003 - Los unique deben ser parciales en tablas con borrado logico

- **Fecha**: 2026-08-30
- **Estado**: aceptada

## Contexto

`payment_method_accounts` tenia `UNIQUE (payment_method_id, currency)` plano.
Con borrado logico (`deleted_at`), una fila borrada sigue ocupando el par
`(medio, moneda)`: si el usuario borra una asociacion ARS y quiere volver a
asociar ARS, el INSERT choca contra el unique aunque la fila vieja este borrada.
El chequeo en la app filtraba `deleted_at IS NULL` y dejaba pasar, pero la base
lo rechazaba -> error 500.

`transactions.tx_external_uniq` ya estaba bien: es un indice unico **parcial**
con `WHERE external_id IS NOT NULL AND deleted_at IS NULL`.

## Decision

**Todo unico sobre una tabla con `deleted_at` se declara como indice unico
parcial `WHERE deleted_at IS NULL`,** no como `UNIQUE` de tabla.

Se aplico ya a `pma_uniq` (modelo, `schema.sql` y migracion
`f25495000839`).

## Por que

El unico plano trata las filas borradas como vivas y rompe el ciclo
crear/borrar/recrear, que con borrado logico es normal. El parcial hace que la
restriccion signifique "unico entre las vigentes", que es lo que se quiere. Se
acepta perder la simpleza del `UNIQUE` de tabla a cambio de coherencia con el
borrado logico.

## Consecuencias

- **Pendiente de convertir cuando se construya cada uno** (hoy planos en
  `schema.sql`, tablas con `deleted_at`):
  - `budgets_uniq` (Inc 8)
  - `group_members_uniq` (fase 3)
  - `users.email` unique (fase 3, registro real)
- Quedan planos a proposito, porque sus tablas **no** tienen `deleted_at` (son
  inmutables o append-only): `fx_uniq` (`exchange_rates`), `sync_state_uniq`
  (`sync_state`).
- Regla para migraciones nuevas: ver tambien la skill `nueva-migracion`.
