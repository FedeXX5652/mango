# 0026 - Espacios: personal y cada grupo, con las mismas pantallas

Estado: aceptada. Etapa 1 implementada (1.1.0); las etapas 2 y 3, pendientes.
Ver "Etapas".
Fecha: 2026-10-01

## Contexto

El modo Grupos no se usaba bien. La pantalla de un grupo era **un scroll de ocho
bloques apilados**: resumen, balance, cómo saldar, pagos, presupuesto, cuenta
conjunta, categorías y actividad. Tenía tres problemas:

- **Mezclaba usar con administrar**: las categorías del grupo aparecían en medio
  de la plata.
- **No tenía las herramientas de lo personal**: no se podían filtrar los
  movimientos del grupo ni ver sus estadísticas o su presupuesto en una pantalla
  propia.
- **Era otro modelo mental**: lo personal son cuatro pantallas con barra; el
  grupo, una página distinta. Había que aprender la app dos veces.

La idea que salió: que el grupo se vea **como un individuo, pero solo con lo del
grupo**, y poder pasar de un espacio a otro como entre cuentas de una app (Slack,
Notion, Revolut).

## Decision

### Espacios

Un **espacio** es Personal o un grupo. Las pantallas principales (Inicio,
Movimientos, Presupuesto, Estadísticas) son **las mismas en todos los espacios** y
muestran lo de ese espacio.

- **El espacio va en la URL, no en un modo escondido.** "Volver" y los atajos
  funcionan solos, y la dirección siempre dice dónde estás. Las dos familias de
  rutas usan **los mismos nombres de sección**:

  | | Personal | Grupo |
  |---|---|---|
  | Inicio | `/` | `/grupos/<grupo>` |
  | Movimientos | `/movimientos` | `/grupos/<grupo>/movimientos` |
  | Detalle | `/movimientos/<id>` | `/grupos/<grupo>/movimientos/<id>` |
  | Presupuesto | `/presupuesto` | `/grupos/<grupo>/presupuesto` |
  | Estadísticas | `/estadisticas` | `/grupos/<grupo>/estadisticas` |
  | Ajustes | `/ajustes` | `/grupos/<grupo>/ajustes` |

  `/grupos` es la lista para administrarlos y crear uno. **No quedan rutas
  viejas ni redirecciones**: la página única `/grupos/<id>` pasó a ser el Inicio
  del grupo, y `/presupuestos` pasó a `/presupuesto` (singular, como la sección
  del grupo). Una dirección desconocida va a Inicio. La barra inferior y la
  lateral llevan a la misma sección dentro del espacio actual
  (`rutaEspacio(espacio, seccion)` en `lib/espacios.ts`).
- **El estado de la pantalla también va en la URL**: el mes y los filtros de
  Movimientos (`?mes=2026-09&quien=…&categoria=…`). Así, entrar a un gasto y
  volver deja la lista donde estaba.
- **Selector siempre a la vista**: un chip con el color y el nombre del espacio
  arriba a la izquierda de cada pantalla principal ("● Casa ▾"). Al tocarlo se
  abre una hoja con cada espacio, **+ Nuevo grupo** y **Administrar grupos**.
  Cambiar de espacio deja en la **misma sección** del otro (Movimientos de Casa →
  Movimientos personal). En escritorio, arriba de la barra lateral. Hoy cada
  fila dice cuántos miembros tiene; el resumen de una línea ("Beto te debe $X")
  llega con la tarjeta de grupos del Inicio personal (etapa 2).
- **La app abre siempre en Personal.** Así no se carga algo personal en un grupo
  sin darse cuenta. Para entrar directo al grupo está el atajo "Último grupo"
  (0023), que sigue en `/grupos/ultimo` y ahora abre el Inicio del grupo.

### Qué es cada pantalla en un grupo

| | Personal | Grupo |
|---|---|---|
| Inicio | Como hoy, más una tarjeta corta por grupo ("Casa: Beto te debe $X ›") | Balance y **Saldar**, cuenta conjunta y **Poner plata**, cómo va el mes, lo último |
| Movimientos | Mi plata (lo compartido, con chip) | Los gastos compartidos de todos ("pagó Beto · tu parte $X") **con los pagos intercalados** ("Beto → Vos $750 · saldado"), con filtros por quién pagó y categoría |
| Presupuesto | Mis sobres | Los topes del grupo |
| Estadísticas | Lo que pagué | El gasto del grupo por categoría, por miembro y su evolución |

- **Un gasto compartido ajeno se ve en solo lectura**: monto, categoría, quién
  pagó, reparto, fecha y comercio. **Solo lo edita quien lo cargó**, que es la
  regla que ya aplica el servidor y la que protege lo privado de cada uno (la
  cuenta no viaja, 0021).
- **Los cobros por confirmar quedan en el Inicio personal**: un cobro es un
  ingreso pendiente que entra a una cuenta mía (0018), así que es plata
  personal aunque venga de un grupo.
- Metas, Deudas, Recurrentes y Plantillas siguen siendo personales. En un grupo,
  los accesos de Inicio serán Saldar, Poner plata, Miembros y Categorías del
  grupo (etapa 2).
- **Administrar un grupo** (nombre, color, miembros y categorías) sale de la
  pantalla de uso y va a **Ajustes del grupo**: el engranaje del Inicio del grupo
  en el móvil y una sección más de la barra lateral en escritorio.

### Cargar

El "+" toma el espacio actual. En un grupo, el gasto ya viene "compartido con
Casa", con las categorías del grupo y el reparto. El formulario dice **"Nuevo
gasto en ● Casa"** y deja cambiarlo. Como cuenta ofrece las propias y las
cuentas conjuntas del grupo.

### Plata entre espacios

No se inventa nada: **el grupo no tiene plata suelta** (0014).

- **Poner o sacar plata de Casa** es una transferencia entre una cuenta propia y
  la cuenta conjunta del grupo (0016).
- **Entre dos personas** es Saldar (0017).

### Lo personal muestra lo pagado

Las estadísticas personales cuentan **lo que salió de la cuenta**, no "mi
parte". Si pagué $15.000 para Casa y Beto me devuelve $7.500, ese cobro entra
como ingreso (0018), y el neto es mi parte real sin que la app calcule nada. El
reintegro no es un ingreso de verdad: los cobros van a una categoría de sistema
**"Reintegros de grupo"**, y Estadísticas la muestra aparte de los ingresos.

### Barra móvil

Con el selector, la pestaña Grupos sobra: la barra pasa a ser **Inicio ·
Movimientos · + · Presupuesto · Estadísticas** (ajusta 0022). La lista de grupos
pasa a "Administrar grupos".

### Espacios personales aislados: más adelante

Separar lo propio en espacios aislados (por ejemplo, un emprendimiento) es, en
la práctica, **un grupo de una sola persona con su cuenta común**, fondeada con
plata propia. Sale con la misma maquinaria cuando haga falta. Queda en el
BACKLOG.

## Por que

La misma app en todos lados: quien sabe usar lo personal ya sabe usar un grupo.
Los datos ya estaban separados por ámbito (`group_id` en categorías, etiquetas,
topes y cuentas conjuntas, y el lente del grupo en 0021). Lo que faltaba era la
interfaz, así que el cambio es casi todo de presentación, sin migraciones
grandes.

El riesgo de un modelo con "modos" es cargar en el espacio equivocado. Se cubre
con cuatro cosas: el espacio en la URL, el chip siempre visible, el formulario
que dice dónde va a quedar el gasto y la app que abre en Personal.

## Etapas

1. **El espacio como lugar** (hecha, 1.1.0): selector, rutas unificadas
   `/grupos/<grupo>/…` sin redirecciones, las **cuatro pantallas del grupo** y
   **Ajustes del grupo**. Lo nuevo de verdad es el selector y Movimientos del
   grupo (pagos intercalados, filtros, detalle de solo lectura). Inicio,
   Presupuesto y Estadisticas del grupo reparten lo que estaba apilado en una
   sola pagina. Sin migraciones ni cambios en la sync.
2. **Cargar y mover plata**: el "+" toma el espacio, **Poner plata**, los
   accesos del Inicio del grupo, la tarjeta de grupos en el Inicio personal (y
   su resumen en el selector) y la **barra con Estadisticas en lugar de Grupos**
   (ahi se marca 0022 como ajustada).
3. **Reintegros de grupo** como categoria de sistema y su separacion en
   Estadisticas.

## Consecuencias

- Ajusta 0014 (cómo se presenta el grupo; el modelo de plata no cambia), 0022
  (la barra, en la etapa 2) y 0023 (el atajo de Presupuesto pasa a
  `/presupuesto`; "Último grupo" abre el Inicio del grupo).
- Una sección nueva se agrega a `Seccion` en `lib/espacios.ts` y existe en los
  dos espacios con el mismo nombre; no se inventan rutas sueltas por espacio.
- Una pantalla nueva de uso diario se piensa para los dos espacios desde el
  principio.
