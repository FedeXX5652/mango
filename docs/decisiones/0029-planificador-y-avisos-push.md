# 0029 - Planificador en el servidor y avisos push

Estado: aceptada
Fecha: 2026-10-03

## Contexto

Hasta la 1.3.0 el servidor solo trabajaba cuando alguien le pedía algo:

- Los avisos (0019) existían solo en la bandeja de la app. Si no la abrías, no
  te enterabas de que te habían registrado un pago.
- La cotización del día (0005) se pedía al abrir la app. La serie solo crecía
  los días en que alguien entraba.
- El calendario de pagos (1.5.0) necesita avisar a una hora, con la app cerrada.

Para avisar con la app cerrada hay tres caminos, y dos no sirven:

- **Programar el aviso en el teléfono** (Notification Triggers): Chrome abandonó
  la API y nunca salió.
- **Envoltorio nativo de Android**: descartado por el usuario (2026-10-03).
- **Push desde el servidor** (Web Push): el estándar de las PWA. Depende de que
  heimdall esté prendido.

Decisión del usuario (2026-10-03, H1): **push cuando heimdall está prendido; si
no, los avisos quedan solo en la app**. No hay sincronización periódica en
segundo plano: en Android es poco confiable y en iPhone no existe.

## Decision

### Un planificador dentro del backend

Es una tarea de asyncio que arranca con la app (`main.lifespan`), no un servicio
ni un cron aparte (`services/planificador.py`):

- **Se despierta cada minuto**, y también **al instante** cuando se confirma un
  aviso nuevo en la base. `notification.crear` engancha el despertar al
  `after_commit` de la sesión: si la transacción se revierte, no despierta.
- **Cada tarea tiene su candado de Postgres** (`pg_try_advisory_lock`). Aunque
  haya más de un backend, nunca corren dos a la vez. El candado es de la
  *conexión*, así que se toma y se suelta en una conexión apartada para eso. La
  sesión de la tarea no sirve: en cada commit devuelve su conexión al pool, y el
  unlock podía caer en otra conexión y dejar la tarea trabada para siempre.
- **Una tarea que falla no frena al resto**, y un error del propio planificador
  (por ejemplo, la base reiniciándose) tampoco: se anota y se reintenta en la
  vuelta siguiente.

Las tareas:

| Tarea | Cada | Qué hace |
| --- | --- | --- |
| `avisos` | 1 min, o al despertar | Manda por push los avisos sin `pushed_at` |
| `cotizaciones` | 1 h | La cotización de hoy de cada usuario; si ya está, no se vuelve a pedir |

La 1.5.0 suma los recordatorios del calendario de pagos.

### Web Push con VAPID

- Las claves VAPID viven en el `.env` del servidor. Se generan con
  `backend/scripts/generar_vapid.py`, que nunca las imprime. **Sin claves no hay
  push**: `GET /push/config` responde `disponible: false`, la app lo dice en
  Ajustes y los avisos siguen en la bandeja.
- **La suscripción es de cada dispositivo** (`push_subscriptions`). Es estado del
  servidor y no se sincroniza: el endpoint y las claves son de ese navegador.
  - **Alta o actualización por endpoint**, en una sola sentencia
    (`INSERT … ON CONFLICT`): dos altas a la vez del mismo dispositivo no chocan.
  - Si el endpoint es de otra persona, **pasa a ser de quien lo registra solo si
    trae las mismas claves**: es el mismo navegador y ahí inició sesión otra
    persona. Con otras claves no es ese navegador, y la respuesta es 404:
    conocer el endpoint de alguien no alcanza para cortarle los avisos.
  - **Cerrar sesión da de baja** la suscripción de ese dispositivo.
  - `tipos` guarda qué familias acepta cada dispositivo (`grupos`,
    `recordatorios`; NULL = todas). Queda listo para preferencias por
    dispositivo. Un tipo de aviso que no está en `FAMILIA` es su propia
    familia: le llega a quien acepta todo, nunca a quien eligió otras.
- **Cuándo se da de baja una suscripción** (borrado lógico): cuando el servicio
  de push responde **404 o 410** (el dispositivo ya no existe) o **401 o 403**
  (no acepta las claves del servidor). Otros errores (413, 429, 5xx) son
  pasajeros y no la tocan.
  - **Excepto si es nueva** (menos de 5 minutos). Medido con FCM: un endpoint
    recién creado puede dar **410 durante 5 a 10 segundos** y después 201,
    con el mismo endpoint. Mientras es nueva, un 404/410 se reintenta a los
    2, 3, 5 y 10 segundos, y nunca la da de baja. Sin esto, el primer aviso
    de prueba borraba una suscripción sana.
- **Si el servidor cambia de claves, cada dispositivo se arregla solo.** Al
  abrir la app, si su suscripción es de otra clave, la rehace (el permiso ya
  está dado, no hace falta un toque) y da de baja la vieja en el servidor.
- **`pushed_at` marca lo despachado**, también cuando no había a dónde mandarlo:
  un dispositivo que se suscribe después no recibe lo de antes. Lo que tiene más
  de 48 h (`push_max_antiguedad_h`) se marca sin mandar. Así, si heimdall estuvo
  apagado, al volver no llega una catarata de avisos viejos: quedan en la
  bandeja. La migración marca como despachados todos los avisos que ya existían.

### Cómo se ve un aviso

- **Dice a qué pertenece**: el título trae el grupo ("Casa · Te registraron un
  pago"; `notification.de_grupo`).
- **Usa el logo con fondo transparente**: `icon` es `mango-512.png` y `badge` es
  el monocromo `mango-mono-96.png` para la barra de Android.
- **`tag` por origen**: uno nuevo del mismo origen reemplaza al anterior en vez
  de apilarse.
- **Tocarlo abre su pantalla** (`link`). Si la app está abierta, va al frente y
  navega sin recargar. Si no, se abre ahí. Solo se aceptan rutas de la app: un
  link que resuelve a otro origen (`//x`, `/\x`) lleva al inicio.

Los manejadores (`public/sw-push.js`) se suman al service worker de 0028 con
`workbox.importScripts`.

## Por que

- **Dentro del backend y no como servicio aparte**: heimdall corre un solo
  backend. Un contenedor más es una pieza más para mantener, y no gana nada. El
  candado ya cubre el día en que haya dos.
- **Despertar al confirmar**: un pago registrado avisa en segundos y no en hasta
  un minuto, sin consultar la base todo el tiempo.
- **Las cotizaciones en el servidor**: la serie diaria (fase 4, 1.6.0) no puede
  tener huecos por los días en que nadie abrió la app.

## Consecuencias

- **Sin heimdall no hay push.** Los avisos esperan en la bandeja. Al volver, lo
  de más de 48 h no sale por push.
- **iPhone**: solo con la app instalada en la pantalla de inicio (iOS 16.4 o
  más), y sin botones de acción en el aviso.
- **En desarrollo no hay service worker** (0028): el push se prueba con el build
  (`vite preview`). Con Playwright, Chrome no da push en incógnito y el perfil
  persistente necesita una ruta corta en Windows (MAX_PATH).
- **Los rechazos del servicio de push se registran** con código y cuerpo
  (warning): explican por qué un dispositivo dejó de recibir.
- **Activar y probar pueden tardar.** Suscribirse registra el navegador en su
  servicio de push (en un Chrome recién instalado, hasta 30 segundos), y la
  prueba puede esperar los reintentos (hasta 20 segundos). La pantalla lo dice
  ("Activando los avisos…", "Enviando…").
- **API**: las rutas de `/push` se justifican como endpoints (3.11): la
  suscripción no se sincroniza y mandar un push solo lo puede hacer el servidor.
