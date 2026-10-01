# Backlog

Cosas decididas-para-despues y cabos sueltos. El roadmap por fases vive en
`ESPECIFICACION.md` §7; esto es lo diferido a proposito, para no perderlo.

## Transporte y seguridad de red

- **Caddy / TLS.** Hoy, hacia afuera de la casa se entra por **Tailscale** (cifra
  punta a punta). Adentro, por LAN pelada y HTTP, la clave y el token viajan en
  claro. Mejora barata: **entrar por el nombre de Tailscale tambien desde casa**.
  TLS con Caddy queda para cuando se publique de verdad. Con 0020 es simple: hay
  **un solo puerto** (`MANGO_PORT`) y Caddy apunta ahi.
- **No publicar `MANGO_PORT` fuera del tailnet.** La API ya tiene auth (3a), pero
  exponerla a internet es innecesario.
- **Fijar la version base de PowerSync** en el release (`POWERSYNC_VERSION`).
  Hoy es `latest`, congelada en cada imagen publicada; fijarla da builds
  reproducibles.

## Notificaciones push (fase futura, ver 0019)

La **bandeja in-app ya esta** (0019). El push (avisos fuera de la app) queda:
- Service worker + `PushManager` + suscripciones (tabla nueva).
- Claves **VAPID**; el backend enviando los push.
- Requiere **HTTPS** (va de la mano con Caddy).
- Reusa los eventos que ya escriben en `notifications`: es otro canal del mismo aviso.

## Auditoria de frontend (2026-09-30, ver 0022)

Auditoria completa de las 19 vistas en movil (390 y 360 px, claro y oscuro) y
escritorio (1440 px), con axe (WCAG 2.2 AA) y chequeos de layout. Lo que ya se
arreglo esta en 0021, 0022 y 0023: sync del grupo, barra movil, contraste,
nombres accesibles, controles de menos de 24 px, landmarks y h1. Esto es lo que
queda. **No son defectos de AA**: son diferencias con DESIGN.md o mejoras que
tocan el sistema entero, y van con decision propia.

- **Decidir a donde llevan las tarjetas de cuenta de Inicio.** A Movimientos
  filtrado por esa cuenta (recomendado: es la pregunta "¿que paso en esta
  cuenta?") o a Estadisticas. Necesita el filtro por URL en Movimientos
  (`?cuenta=`).
- **Escala tipografica vs DESIGN.md 3.** El codigo usa la de Tailwind (12, 14,
  20, 30) y DESIGN define 13 (secundaria), 15 (cuerpo), 24 (titulo) y 32 (monto
  destacado). Propuesta: tamaños con nombre de rol en `tailwind.config.ts`
  (`text-secundaria`, `text-cuerpo`, `text-titulo`, `text-destacado`) y migrar
  por pantalla, con pasada visual en 360 px.
- **44 px en movil** para los controles que hoy miden 40 (botones de icono:
  archivar, eliminar, editar, volver, mes anterior/siguiente; campos y
  desplegables), 32 (`Segmentado`) o 24 (muestras de color de Grupos,
  `Interruptor`). Todos pasan el minimo de AA (24); 44 es la recomendacion para
  touch. Propuesta: variante `icon` a 44 solo en el arbol movil.
- **Filtros de Movimientos en movil**: DESIGN.md 2 dice "Hoja inferior
  desplegable". Hoy son seis controles en tres filas arriba de la lista.
- **Detalle de movimiento en escritorio**: DESIGN.md 2 dice "Panel lateral, la
  lista queda visible". Hoy es pantalla completa.
- **Contador de pendientes en la navegacion** (DESIGN.md 7): todavia no esta.
  Cobra sentido con la bandeja de pendientes de la fase 2.
- **Borde de los campos** (`input` `#CFC5AD` sobre blanco: 1,7:1). WCAG 1.4.11
  pide 3:1 cuando el borde es lo que delimita el control. Oscurecer el token o
  darle fondo `muted` al campo.
- **`Segmentado` usa roles de pestañas** (`tablist`/`tab`) sin panel: lo que hace
  es elegir un valor, asi que semanticamente es un grupo de radio (`radiogroup`,
  `aria-checked`, flechas del teclado).
- **Header de escritorio**: dice "Finanzas", un texto de relleno. Deberia mostrar
  el titulo de la pantalla o nada.
- **Espaciados fuera de la escala de 4** (DESIGN.md 3): 43 usos en 22 archivos
  (`gap-0.5`, `gap-1.5`, `gap-2.5`, `space-y-1.5`, `space-y-5`, `p-5`…). Pasada
  mecanica.
- **Alta en la primera sincronizacion**: con la base local todavia vacia muestra
  "No tenés cuentas todavía (o están sincronizando)". Deberia mostrar el
  esqueleto hasta la primera sync (`useStatus().hasSynced`), como pide 0008.
- **Desbloqueo biometrico** (Ajustes > Seguridad) es un boton con el estado en
  texto: por DESIGN.md 7 va `Interruptor`.
- **Texto chico deliberado**: los montos por dia del calendario (10 px) y los
  decimales y el simbolo de `Monto` (piso de 11 px, 0006) quedan debajo de los 13
  px de DESIGN. Revisar junto con la escala tipografica.

## PWA: ideas que salieron con los atajos (0023)

- **Grupo favorito** para el atajo del grupo, si "el ultimo abierto" no alcanza
  (varios grupos de uso parejo).
- **`share_target`**: compartir la foto de un ticket a Mango desde la galeria y
  que abra un movimiento nuevo con el adjunto (los adjuntos ya existen, fase 5).
- **`screenshots`** en el manifiesto: Android y Chrome de escritorio muestran un
  dialogo de instalacion mas rico con capturas.

## Cabos sueltos

- **`users.email` -> `username`.** Hoy conviven; el `email` quedo de relleno. Cuando
  la forma este firme, contraer la columna (expandir/contraer, 0012).
- **Transformaciones de la cola de rechazados** (0011). Hoy un rechazo se guarda y
  se puede reintentar o descartar; falta poder **editarlo** antes de reintentar.
- **Conciliar las dos puntas de un pago** (0018): que el acreedor no tenga que
  recategorizar si no quiere (categoria "Cobros" por defecto).
- **Mas eventos de notificacion** (0019): te quitaron de un grupo, gasto compartido
  nuevo, presupuesto del grupo excedido.

## Fases del roadmap que faltan (resumen; detalle en ESPECIFICACION §7)

- **Fase 2 - Ingesta automatica.** n8n lee el correo, postea a la API, cae en la
  **bandeja de pendientes**; reglas por comercio (`category_rules`) y **sugerencias
  de IA** que nunca se aplican solas; deduplicacion. Es el otro pilar del producto
  y esta **entero pendiente** (las tablas existen en el esquema, sin usar).
- **Fase 4 - resto.** El **reparto/liquidacion ya se hizo** en 3b (splits,
  settlements, cobros). Falta: **tipos de cambio con historico** y **reportes
  convertidos a moneda base**.
- **Fase 5 - Extras.** HECHA (metas, deudas/prestamos, fechas de tarjeta, adjuntos).
  Pendiente relacionado: **adjuntos offline** (hoy subir/ver necesita conexion) y
  **limpieza de binarios** de adjuntos borrados (hoy queda el archivo en disco).
