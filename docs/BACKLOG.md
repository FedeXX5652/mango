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

## Notificaciones push (ver 0019 y 0029)

Hecho en la 1.4.0. Queda:

- **Elegir que avisos recibe cada dispositivo.** `push_subscriptions.tipos` ya
  filtra por familia (`grupos`, `recordatorios`), pero no hay pantalla para
  elegirlas: hoy cada dispositivo recibe todo. Cobra sentido con los
  recordatorios de la 1.5.0, cuando haya dos familias.

## Auditoria de frontend (2026-09-30, ver 0022)

Lo que quedaba se hizo en la 1.2.0: tarjetas de cuenta a Movimientos filtrado,
escala tipografica de DESIGN.md 3, 44 px en el movil, filtros en hoja, detalle en
panel lateral, borde de los campos a 3:1, `Segmentado` como grupo de radio,
header de escritorio, espaciados en la escala de 4, esqueleto del alta en la
primera sincronizacion y el desbloqueo biometrico como interruptor. El texto
chico deliberado quedo documentado como excepcion (DESIGN.md 3). Queda:

- **Contador de pendientes en la navegacion** (DESIGN.md 7). Cobra sentido con
  la bandeja de pendientes de la fase 2.

## Plan acordado (2026-10-03)

En este orden, cada uno con su version. La fase 2 (ingesta) va al final.

- **1.4.0 - Planificador y push: HECHA** (0029). Un proceso en el backend que
  corre cada minuto (con candado en la base para no duplicar): avisos push
  (Web Push con VAPID; `pywebpush`) y la cotizacion de cada dia. Sin heimdall,
  los avisos se ven dentro de la app al abrirla (nada de alarmas en segundo
  plano). Cada aviso dice a que pertenece y usa el logo con fondo transparente
  (`icon` mango-512, `badge` mango-mono-96). Notification Triggers no sirve:
  Chrome termino su desarrollo y nunca salio a estable.
- **1.5.0 - Calendario de pagos** (0030). **Etapa 1 HECHA** (2026-10-04): el
  calendario, la repeticion y "Cargar el pago". **Etapa 2 HECHA** (2026-10-07):
  los avisos, el seguimiento, "Mas tarde" y los botones de Android. Las fechas se
  calculan con el motor en los dos lados, en vez de materializar los ciclos (0030
  explica por que); un dia habil es solo de lunes a viernes, sin feriados (R1).
  Las etapas 1 y 2 salen como **1.5.0**; la etapa 3 (grupo, tarjetas y deudas,
  recurrentes como informacion, el formato para la ingesta) como **1.6.0**, y el
  resto del plan se corre un numero (decidido el 2026-10-08). El indicador de lo
  automatico (A1/A2) y las propuestas de la ingesta (C9) van con la fase 2: hoy
  nada crea recordatorios automaticos.
  Recordatorios (aviso o vencimiento) con
  repeticion tipo Samsung (RRULE propio, sin dependencias, mismos casos de prueba
  en servidor y app), varios avisos por ciclo, seguimiento "¿ya lo pagaste?" hasta
  responder (limitable), zona horaria del
  usuario, botones en la notificacion de Android ("Ya lo pague", "Mas tarde") con
  un permiso de un solo uso. Asociado a una **plantilla** ("Cargar el pago" abre
  el alta con ella; si se borra la plantilla, se desvincula); plantillas de grupo
  para los recordatorios de grupo. "Avisarme" en tarjetas y deudas; recurrentes
  como informacion. Dia habil: se elige al crear, sin opcion preelegida. Lo
  automatico (`origen`) se marca con un indicador chico y discreto, y editarlo
  pide confirmacion y lo pasa a ser del usuario. Formato documentado
  (`docs/recordatorios.md`) para la ingesta. Sale `recurring_rules.auto_create`,
  que nunca se uso.
- **1.7.0 - Fase 4.** Dolar elegible por moneda (MEP por defecto), serie diaria
  completa con historia (ArgentinaDatos para los dolares, Frankfurter/BCE para el
  resto, pivote USD: cambiar la moneda base no obliga a regenerar nada) y grafico
  en Cotizaciones.
- **1.8.0 - Pagos en conjunto.** Un gasto compartido = total + cuanto puso cada
  uno + cuanto le toca a cada uno. Lo que puso otro le llega como "pago por
  confirmar" (de que cuenta salio); cuenta en el balance desde que se carga; lo
  edita quien lo cargo y cada pagador solo su parte. Rechazar es reversible:
  deshacer al instante, sin boton negativo en la notificacion, y "Cambiar" desde
  el gasto. Necesita su propia decision.

## PWA: ideas que salieron con los atajos (0023)

- **Grupo favorito** para el atajo del grupo, si "el ultimo abierto" no alcanza
  (varios grupos de uso parejo).
- **`share_target`**: compartir la foto de un ticket a Mango desde la galeria y
  que abra un movimiento nuevo con el adjunto (los adjuntos ya existen, fase 5).
- **`screenshots`** en el manifiesto: Android y Chrome de escritorio muestran un
  dialogo de instalacion mas rico con capturas.
- **App nativa de Android** (descartada por ahora, 2026-10-03): seria la unica
  forma de tener alarmas locales exactas sin servidor.
- **Suscribir el calendario del telefono** (.ics) a los recordatorios: alarmas
  locales exactas sin heimdall, pero sin botones ni enterarse a tiempo de que se
  pago. Para mas adelante.

## Cabos sueltos

- **`users.email` -> `username`.** Hoy conviven; el `email` quedo de relleno. Cuando
  la forma este firme, contraer la columna (expandir/contraer, 0012).
- **Transformaciones de la cola de rechazados** (0011). Hoy un rechazo se guarda y
  se puede reintentar o descartar; falta poder **editarlo** antes de reintentar.
- **Espacios personales aislados** (0026): un emprendimiento separado de lo
  personal = un grupo de una sola persona con su cuenta comun, fondeada con plata
  propia. Evaluar despues de los espacios de grupo (y si hace falta una vista
  "Todo" que sume patrimonios).
- **Mas eventos de notificacion** (0019): te quitaron de un grupo, gasto compartido
  nuevo, presupuesto del grupo excedido.
- **Los recurrentes mensuales se corren al 28 para siempre** (encontrado el
  2026-10-04). `siguienteFecha` (lib/recurrentes.ts) acumula el tope de fin de mes:
  un alquiler del 31 pasa al 28/2 y de ahi en mas cae el 28 (31/1 -> 28/2 ->
  28/3). La prueba lo da por bueno (`recurrentes.test.ts`). El arreglo es anclar
  al dia original (`day_of_period` ya existe en el modelo). El calendario de pagos
  no tiene el problema: su motor ancla el dia (0030).
- **`SelectorEntidad` no anuncia lo elegido** al lector de pantalla. Dentro de un
  `Campo` (un `<label>`), el nombre del disparador es solo la etiqueta ("Cuenta"),
  no "Cuenta, Efectivo". Mismo arreglo que el selector de repeticion (0030):
  `aria-labelledby` con la etiqueta y el valor.
- **Borrar dos veces termina en "Rechazados"** en todas las tablas salvo los
  recordatorios (0030). Si dos dispositivos borran lo mismo sin conexion (o la
  sync reintenta un DELETE que ya se aplico), el segundo recibe 404 y el conector
  lo registra como rechazo. Arreglo: DELETE idempotente en el backend (lo ya
  borrado devuelve 204, lo ajeno sigue en 404), como `reminders`.
- **`backend/tests/compat/replay.py` tiene una copia vieja del mapa tabla -> ruta**
  del conector: le faltan goals, debts, splits, settlements, notifications y las
  del calendario.
- **El CSV exportado lleva la fecha en ISO** (`occurred_at.isoformat()`, con hora
  y zona). La 1.5.1 paso a dd/mm/aaaa todo lo que se ve en la app, pero el
  archivo se dejo como estaba hasta que el usuario decida: el ISO lo lee
  cualquier planilla, y dd/mm/aaaa perderia la hora.
- **Movimientos salta de `h1` a `h3`** en los titulos de cada dia (regla
  `heading-order` de axe, de "best-practice": la auditoria completa no la mira).
  Encontrado al revisar la 1.5.1. Arreglo: `h2`.

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
