# Cambios

Todas las versiones de Mango. Formato basado en
[Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/); versionado
[SemVer](https://semver.org/lang/es/) (ver `docs/decisiones/0025-versionado.md`).

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
