# 0026 - Espacios: personal y cada grupo, con las mismas pantallas

Estado: aceptada e implementada: etapas 1 (1.1.0), 2 (1.2.0) y 3 (1.3.0). Ver
"Etapas".
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
  los accesos de Inicio son **fijos**: Saldar, Poner plata, Miembros y
  Categorías. No se eligen como los personales (0024): un grupo tiene pocas
  acciones y todas son de uso frecuente. **Saldar** abre directo el pago si hay
  una sola deuda que me toca; si no, la lista de "cómo saldar".
- **Administrar un grupo** (nombre, color, miembros y categorías) sale de la
  pantalla de uso y va a **Ajustes del grupo**: el engranaje del Inicio del grupo
  en el móvil y una sección más de la barra lateral en escritorio.

### Cargar

El "+" toma el espacio actual: el alta del grupo vive en `/grupos/<grupo>/nuevo`
(la sección `nuevo` existe en los dos espacios; la de Personal es `/nuevo`). En
un grupo, el gasto ya viene compartido, con las categorías del grupo y el
reparto (el del grupo, si tiene uno: 0027).

- El formulario dice **"Se carga en ● Casa ▾"** arriba de todo y deja cambiarlo
  ahí mismo. Las transferencias no lo muestran: son entre cuentas propias.
- **Cuentas**: las propias y la conjunta **de ese grupo**. En Personal, solo las
  propias (pagar algo personal con la conjunta de un grupo no tiene sentido).
  En una transferencia, todas.
- Al guardar se va a Movimientos **del espacio donde quedó** el movimiento, no
  del que se partió. Una transferencia que toca la conjunta de un grupo vuelve a
  ese grupo.
- El movimiento se guarda local con su `owner_id` (el servidor lo ignora y pone
  el de la sesión): sin él, un gasto cargado sin conexión no era "mío" y el
  balance del grupo se rompía.

### Plata entre espacios

No se inventa nada: **el grupo no tiene plata suelta** (0014).

- **Poner o sacar plata de Casa** es una transferencia entre una cuenta propia y
  la cuenta conjunta del grupo (0016, 0017): el alta de una transferencia con la
  conjunta ya elegida (`?hacia=` o `?desde=`). Si el grupo no tiene conjunta,
  primero se ofrece crearla.
- Esos **aportes y retiros aparecen en la historia del grupo** ("Vos → Caja
  común"), intercalados con gastos y pagos. La sync ya se los mostraba al grupo
  sin decir de qué cuenta personal salieron (lente b/c, 0021).
- **Entre dos personas** es Saldar (0017).

### Lo personal muestra lo pagado

Las estadísticas personales cuentan **lo que salió de la cuenta**, no "mi
parte". Si pagué $15.000 para Casa y Beto me devuelve $7.500, ese cobro entra
como ingreso (0018), y el neto es mi parte real sin que la app calcule nada. El
reintegro no es un ingreso de verdad:

- Estadísticas y la tarjeta de Resumen lo sacan de "Ingresos" y lo muestran en
  su propia línea, **"Reintegros"**. El resultado no cambia: la plata entró igual.
- Se reconoce por su **vínculo con el pago** (`settlement_id`), no por la
  categoría: así cuentan también los cobros que ya se habían confirmado con otra.
- Cada cobro llega con la categoría de sistema **"Reintegros de grupo"** ya
  puesta (`categories.system_key`): el acreedor solo elige la cuenta. La crea el
  servidor la primera vez que hace falta; se puede renombrar, pero no archivar ni
  borrar.

### Barra móvil

Con el selector, la pestaña Grupos sobra: la barra pasa a ser **Inicio ·
Movimientos · + · Presupuesto · Estadísticas**, las cuatro secciones del espacio
(ajusta 0022). La lista de grupos queda en "Administrar" del selector. Lo que la
pestaña dejaba a un toque —saber si se debe algo— está en la **tarjeta de
grupos** del Inicio personal ("Casa: Beto te debe $X ›") y en la fila de cada
grupo del selector.

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
2. **Cargar y mover plata** (hecha, 1.2.0): el "+" toma el espacio, **Poner
   plata**, los accesos del Inicio del grupo, la tarjeta de grupos en el Inicio
   personal (y su resumen en el selector) y la **barra con Estadisticas en lugar
   de Grupos**. Con ella entro el reparto por partes y el reparto por defecto del
   grupo (0027).
3. **Reintegros de grupo** (hecha, 1.3.0): categoria de sistema con la que llega
   cada cobro, y su linea propia en Estadisticas y en el Resumen.

## Consecuencias

- Ajusta 0014 (cómo se presenta el grupo; el modelo de plata no cambia), 0022
  (la barra, en la etapa 2: hecho) y 0023 (el atajo de Presupuesto pasa a
  `/presupuesto`; "Último grupo" abre el Inicio del grupo).
- Una sección nueva se agrega a `Seccion` en `lib/espacios.ts` y existe en los
  dos espacios con el mismo nombre; no se inventan rutas sueltas por espacio.
- Una pantalla nueva de uso diario se piensa para los dos espacios desde el
  principio.
