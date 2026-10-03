# Backlog

Cosas decididas-para-despues y cabos sueltos. El roadmap por fases vive en
`ESPECIFICACION.md` §7; esto es lo diferido a proposito, para no perderlo.

## Transporte y seguridad de red

- **TLS: ya esta.** En el homelab se entra por **HTTPS con Caddy**
  (`mango.rigr.duckdns.org`), que apunta al unico puerto de la app
  (`MANGO_PORT`, 0020). Lo que queda: que nadie entre por la LAN pelada en HTTP
  (la clave y el token viajarian en claro).
- **No publicar `MANGO_PORT` fuera del tailnet.** La API ya tiene auth (3a), pero
  exponerla a internet es innecesario.
- **Fijar la version base de PowerSync** en el release (`POWERSYNC_VERSION`).
  Hoy es `latest`, congelada en cada imagen publicada; fijarla da builds
  reproducibles.

## Notificaciones push (fase futura, ver 0019)

La **bandeja in-app ya esta** (0019). El push (avisos fuera de la app) queda:
- Service worker + `PushManager` + suscripciones (tabla nueva).
- Claves **VAPID**; el backend enviando los push.
- Requiere **HTTPS**: ya esta (Caddy), asi que no hay nada que lo bloquee.
- Reusa los eventos que ya escriben en `notifications`: es otro canal del mismo aviso.

## Auditoria de frontend (2026-09-30, ver 0022)

Lo que quedaba se hizo en la 1.2.0: tarjetas de cuenta a Movimientos filtrado,
escala tipografica de DESIGN.md 3, 44 px en el movil, filtros en hoja, detalle en
panel lateral, borde de los campos a 3:1, `Segmentado` como grupo de radio,
header de escritorio, espaciados en la escala de 4, esqueleto del alta en la
primera sincronizacion y el desbloqueo biometrico como interruptor. El texto
chico deliberado quedo documentado como excepcion (DESIGN.md 3). Queda:

- **Contador de pendientes en la navegacion** (DESIGN.md 7). Cobra sentido con
  la bandeja de pendientes de la fase 2.

## Espacios y grupos: lo que sigue (0026, 0027)

- **Etapa 3 de espacios**: categoria de sistema **Reintegros de grupo** y su
  separacion en Estadisticas (ver "Conciliar las dos puntas de un pago").
- **"Pago otro"** (0027): cargar un gasto que pago otro miembro ("Beto pago la
  luz"). Cambia el modelo —hoy el gasto es de quien lo carga y su cuenta es
  privada (0021)—, asi que necesita su decision: quien lo edita y de que cuenta
  salio.

## PWA: ideas que salieron con los atajos (0023)

- **Grupo favorito** para el atajo del grupo, si "el ultimo abierto" no alcanza
  (varios grupos de uso parejo).
- **`share_target`**: compartir la foto de un ticket a Mango desde la galeria y
  que abra un movimiento nuevo con el adjunto (los adjuntos ya existen, fase 5).
- **`screenshots`** en el manifiesto: Android y Chrome de escritorio muestran un
  dialogo de instalacion mas rico con capturas.
- **Actualizacion en Android** (2026-10-01, en espera mientras funcione): al
  "cerrar y abrir", Android retoma la PWA desde memoria, sin navegar, y el
  navegador no busca un `sw.js` nuevo; cuando lo encuentra, la pagina abierta no
  se recarga. Tarda una o dos aperturas de cero. Si molesta: registrar el SW a
  mano (`injectRegister: false`), buscar version al volver a primer plano
  (`visibilitychange`) y recargar solo con la app oculta o en la pantalla del
  PIN, nunca en medio de una carga.

## Cabos sueltos

- **`users.email` -> `username`.** Hoy conviven; el `email` quedo de relleno. Cuando
  la forma este firme, contraer la columna (expandir/contraer, 0012).
- **Transformaciones de la cola de rechazados** (0011). Hoy un rechazo se guarda y
  se puede reintentar o descartar; falta poder **editarlo** antes de reintentar.
- **Conciliar las dos puntas de un pago** (0018): que el acreedor no tenga que
  recategorizar si no quiere. Decidido en 0026: categoria de sistema
  **"Reintegros de grupo"**, mostrada aparte de los ingresos en Estadisticas
  (lo personal muestra lo pagado; el reintegro es lo que lo neta).
- **Espacios personales aislados** (0026): un emprendimiento separado de lo
  personal = un grupo de una sola persona con su cuenta comun, fondeada con plata
  propia. Evaluar despues de los espacios de grupo (y si hace falta una vista
  "Todo" que sume patrimonios).
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
