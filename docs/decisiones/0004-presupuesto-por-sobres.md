# 0004 - Presupuesto por sobres (envelope) y etiquetas

- **Fecha**: 2026-08-31
- **Estado**: aceptada

## Contexto

El modelo original (especificacion 3.6) separaba **presupuesto** (tope de gasto
por categoria/periodo) de **meta** (objetivo de ahorro con monto y fecha, tabla
`goals`). Al usarlo aparecio que ambas cosas son el mismo mecanismo: apartar
plata en un "sobre". Y que sin una dimension aparte de la categoria, presupuestar
un proyecto (un viaje) ensucia los informes por categoria.

## Opciones evaluadas

- **Tope simple + metas aparte (original).** Facil, pero no arrastra saldos, no
  tiene "por asignar", y obliga a mantener dos conceptos que hacen casi lo mismo.
- **Sobres / base cero (Actual/YNAB).** Un solo mecanismo para topes y ahorro,
  con arrastre por sobre y "por asignar". Mas potente; cambia la filosofia del
  modelo de datos a budget-first.

## Decision

**Presupuesto por sobres.** Se reescribe la especificacion 3.6. Puntos clave:

- Un sobre es la vista presupuestaria de una **categoria** (no una entidad nueva).
- Asignar no mueve plata: cuentas = cuanta plata hay; sobres = para que esta
  comprometida; cierran contra "por asignar".
- **Arrastre por sobre** (`budgets.rollover`, ya existe). Un sobre con arrastre y
  sin gasto acumula: eso reemplaza a las "metas" de ahorro.
- **Cuentas dentro/fuera** del presupuesto (`accounts.off_budget`, ya existe).
- No se bloquea nada; los sobregiros (sobre en rojo, "por asignar" negativo) se
  avisan, no se impiden.
- **Etiquetas** como dimension separada de la categoria, para reportar proyectos
  (viajes) sin ensuciar los informes por categoria.
- **Un padre es hoja y grupo a la vez, y siempre presupuestable.** Regla de
  consumo: cada movimiento consume del sobre de su **categoria exacta**, y de
  ninguno mas. El encabezado del grupo suma padre e hijas pero es **informativo**:
  no se le asigna plata, no entra en "por asignar" ni en la suma del invariante.
  Es contraintuitivo respecto de YNAB/Actual (donde el padre es solo grupo), asi
  que se documenta para que nadie lo "corrija" creyendo que es un bug. Se eligio
  asi porque con padres-solo-grupo, agregar una subcategoria a una categoria con
  movimientos y presupuesto la rompe (deja de ser hoja, su presupuesto queda
  huerfano); con padre siempre presupuestable, eso no pasa.

## Por que

Un solo mecanismo cubre lo que el usuario pidio (topes de gasto **y** apartar
para objetivos), con el aviso mas util de todos: "te pasaste en total", no solo
"te pasaste en una categoria". Se acepta perder la simplicidad del tope suelto y
asumir un modelo con mas invariantes (todo tiene que cerrar).

## Consecuencias

### Esquema (implementado)

- `tags` y `transaction_tags` **agregadas** (migracion `fcf7cf6327ac`), sin
  interfaz todavia.
- **El sobre es la categoria**: `categories += rollover` (migracion
  `5c0af955cf8e`; `default_budget` se agrego y se quito en `92b5f6feb74b`, ver
  abajo). Ahi vive el arrastre del sobre.
- **Sin "asignacion por defecto".** Se evaluo un `default_budget` por sobre pero
  se descarto: la asignacion recurrente la cubre el **sistema de recurrentes** via
  `budget_rules` (migracion `4a6d083495f0`): una regla por sobre que crea la fila
  de `budgets` de cada mes desde `/recurring/run`, sin pisar lo asignado a mano.
  Un sobre = una categoria que se **agrega a mano** (tiene alguna fila de
  `budgets`); no se muestran todas las categorias.
- **`budgets` = asignacion mensual** (una fila por sobre/mes). Se **quitaron**
  `budgets.period` (los sobres son solo mensuales) y `budgets.rollover` (paso a
  `categories`); `budgets_uniq` ahora es (owner, group, category, period_start).
- `accounts.off_budget`: ya existia, define si la cuenta suma a "por asignar".
- Se reconciliaron a modelos+migracion los checks `tx_categoria_obligatoria_chk`
  (con excepciones `pending` **y** `rejected`) y `tx_transfer_sin_categoria_chk`.

### Pendiente

- **Goals: probablemente NO se fusionan con los sobres.** Al pensar un prestamo
  (o un ahorro con fecha) aparecio que responden preguntas distintas: los sobres
  dicen *"cuanto asigno este mes"*; las metas, *"cuanto me falta para llegar"*
  (progreso a horizonte largo: "3 de 5 pagos, restan 120.000"). Los sobres son
  mensuales; esa vista de progreso no sale de ahi. Un **sobre de ahorro**
  (categoria con `rollover=true`) cubre "apartar plata mes a mes"; la vista de
  meta con fecha es lo que queda pendiente. **Decision aplazada**: por ahora
  entidades separadas, `goals` queda en el esquema sin interfaz.
- Etiquetas en la interfaz.

### Interfaz

- **Hecho**: la mecanica completa de sobres (por asignar con negativo, arrastre
  por `rollover`, sobres de ahorro que acumulan, asignacion como repartir,
  sobregiros visibles sin bloquear). Los sobres se **agregan a mano**; arriba un
  panel resumen (por asignar, asignado, gastado, disponible) con barra. Cada
  tarjeta muestra asignado/gastado/disponible en columnas + barra propia; en su
  config (⚙) estan "Ahorro (acumula)", "Asignar automaticamente cada mes"
  (`budget_rules`, icono 🔁) y "Quitar". Presupuesto es destino propio (5º, ver
  `DESIGN.md` 2).

### Navegacion

`DESIGN.md` pasa de 4 a 5 destinos en la barra inferior movil (se agrego
Presupuestos), para que el documento no contradiga al codigo.
