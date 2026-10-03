# Cambios

Todas las versiones de Mango. Formato basado en
[Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/); versionado
[SemVer](https://semver.org/lang/es/) (ver `docs/decisiones/0025-versionado.md`).

## [1.2.0] - 2026-10-02

### Agregado

- **El "+" carga en el espacio donde estás** (0026, etapa 2): dentro de un grupo,
  el gasto sale compartido, con las categorías, la cuenta conjunta y el reparto
  del grupo. El formulario dice **"Se carga en ● Casa"** y se cambia ahí mismo.
  Al guardar, vas a Movimientos del espacio donde quedó.
- **Poner y sacar plata** de la cuenta conjunta: una transferencia con la
  conjunta ya elegida. Si el grupo no tiene una, primero se ofrece crearla. Los
  aportes y retiros aparecen en la historia del grupo.
- **Accesos del Inicio del grupo**: Saldar (directo al pago si hay una sola deuda
  que te toca), Poner plata, Miembros y Categorías.
- **Tarjeta de grupos en el Inicio personal** ("Casa: Beto te debe $X ›"), con la
  misma línea en el selector de espacio.
- **Reparto por partes** ("2 a 1") y **reparto por defecto del grupo** (Casa
  60/40), como Splitwise (0027): cada gasto nuevo del grupo arranca con él y se
  puede cambiar al cargarlo. Se configura en Ajustes del grupo.
- **Detalle en un panel al lado de la lista** en escritorio: la lista queda a la
  vista con su mes y sus filtros, y la fila abierta, marcada.
- **Filtros de Movimientos en una hoja** en el teléfono: la búsqueda a la vista,
  el resto en "Filtros (n)" y los activos como chips que se quitan.
- Las **tarjetas de cuenta del Inicio** llevan a los movimientos de esa cuenta.

### Cambiado

- **Barra móvil: Inicio · Movimientos · + · Presupuesto · Estadísticas**. Grupos
  salió: se entra con el selector de espacio ("Administrar" lleva a la lista).
- **Todos los filtros de Movimientos van en la dirección**: volver de un
  movimiento deja la lista como estaba.
- **Escala tipográfica de DESIGN.md**: cuerpo 15 px, secundaria 13, título 24 y
  monto destacado 32.
- **44 px en el teléfono** para botones, campos, desplegables, controles
  segmentados e interruptores.
- El **borde de los campos** llega a 3:1 de contraste en todos los temas.
- `Segmentado` es un grupo de opciones para el lector de pantalla y se maneja con
  las flechas del teclado.
- El desbloqueo biométrico es un interruptor.

### Arreglado

- **Un gasto cargado sin conexión rompía las pantallas del grupo** (y se veía
  como ajeno) hasta que sincronizaba: ahora se guarda con su dueño desde el
  principio. Lo mismo para una cuenta nueva, que no aparecía en Cuentas.
- **El reparto por porcentaje usaba punto flotante** y podía darle un centavo a
  alguien con 0 %: ahora es entero, por el método del mayor resto.
- **Montos en monedas sin decimales (JPY, CLP)**: la calculadora los convertía
  con la moneda base (guardaba 100 veces lo tipeado), y al editar un movimiento,
  un reparto, un tope, un pago o una deuda el campo mostraba un monto 100 veces
  más chico, que al guardarse lo corrompía. Ahora cada campo se llena y se lee
  con los decimales de su moneda, sin punto flotante.
- En el escritorio, **Escape en un selector abierto sobre el alta cerraba los
  dos** y se perdía lo cargado. Los modales ahora llevan el foco adentro, lo
  retienen y lo devuelven al cerrar.
- La calculadora tomaba las teclas de un selector abierto encima: **Escape
  borraba el monto** y Enter no activaba Guardar.
- La historia del grupo mostraba **el día equivocado** para lo cargado después de
  las 21 (usaba la fecha UTC). Lo mismo en las fechas de avisos y rechazados.
- El panel de detalle se iba de la vista al bajar por la lista: el escritorio
  scrollea el contenido, no la página entera.
- Las anclas de Ajustes del grupo (Miembros, Categorías) llegan a su sección.
- Un enlace a una cuenta, categoría o etiqueta borrada ya no filtra la lista por
  algo invisible.
- Los montos no se parten en dos líneas en columnas angostas.
- El alta muestra un esqueleto hasta la primera sincronización, en vez de "No
  tenés cuentas".
- El header de escritorio ya no dice "Finanzas".

## [1.1.0] - 2026-10-01

### Agregado

- **Espacios** (0026, etapa 1): Personal y cada grupo tienen las mismas
  pantallas —Inicio, Movimientos, Presupuesto y Estadísticas— y se pasa de uno a
  otro con un **selector** siempre a la vista (arriba de cada pantalla en el
  teléfono, arriba de la barra lateral en la compu). Cambiar de espacio deja en
  la misma sección.
- **Movimientos del grupo**: gastos y pagos entre miembros intercalados por
  fecha, con "pagó Beto · tu parte $X", navegación por mes y filtros por quién
  pagó y categoría. Un pago se abre en una hoja con **Deshacer**.
- **Gasto ajeno en solo lectura**: monto, categoría, quién pagó, reparto, fecha
  y comercio. Solo lo edita quien lo cargó.
- **Inicio del grupo**: cómo quedás y cómo saldar, el gasto del mes contra los
  topes, la cuenta conjunta y lo último que pasó.
- **Ajustes del grupo**: nombre, color, miembros (con nombre y dueño) y
  categorías, fuera de las pantallas de uso.

### Cambiado

- **Direcciones unificadas**: un grupo vive en `/grupos/<grupo>` y sus
  secciones en `/grupos/<grupo>/movimientos`, `…/presupuesto`, `…/estadisticas`
  y `…/ajustes`, con los mismos nombres que lo personal. El presupuesto personal
  pasa de `/presupuestos` a `/presupuesto`. No quedan rutas viejas: una dirección
  desconocida lleva a Inicio.
- **El mes y los filtros van en la dirección** (`?mes=2026-09`): entrar a un
  movimiento y volver deja la lista en el mismo mes.
- La pantalla única del grupo (ocho bloques apilados) se repartió en las
  pantallas del espacio.

### Arreglado

- **Borrar un movimiento pide confirmación**, como el resto de lo que elimina
  (DESIGN.md 7). Antes se borraba con un toque.
- Volver, guardar o borrar desde el detalle de un movimiento regresa a la lista
  de donde se vino, con su mes; si se entró directo, a Movimientos del espacio
  actual (antes, borrar desde un grupo llevaba a lo personal).

## [1.0.1] - 2026-10-01

### Arreglado

- **Presupuesto del grupo**: un grupo recién creado mostraba las ~20 categorías
  de su árbol por defecto con "$ 0 · poner tope", como si tuviera presupuestos
  armados. Ahora muestra solo las categorías con tope y, sin ninguno, un estado
  vacío con **Agregar tope** (categoría + monto). No se había creado ningún
  presupuesto: era solo lo que mostraba la pantalla.

## [1.0.0] - 2026-10-01

Primera versión numerada: la que ya está en uso diario en el homelab.

### Incluye

- **Finanzas personales**: cuentas, medios de pago, categorías de dos niveles,
  etiquetas, presupuesto por sobres, recurrentes, plantillas, metas de ahorro,
  deudas y préstamos, adjuntos y multimoneda.
- **Compartido**: grupos con su propia taxonomía, reparto estilo Splitwise,
  saldar deudas, cuenta conjunta, presupuesto del grupo y notificaciones in-app.
- **Local-first**: base en cada dispositivo con PowerSync; lo del grupo, en sus
  propias tablas locales (0021).
- **PWA**: instalable, con atajos del ícono (0023) y accesos de Inicio elegibles
  (0024).
- **Self-hosted**: imágenes en GHCR, una sola puerta de entrada y respaldos
  diarios verificados (0020).
