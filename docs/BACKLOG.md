# Backlog

Cosas decididas-para-despues y cabos sueltos. El roadmap por fases vive en
`ESPECIFICACION.md` §7; esto es lo diferido a proposito, para no perderlo.

## Transporte y seguridad de red

- **Caddy / TLS.** Hoy, hacia afuera de la casa se entra por **Tailscale** (cifra
  punta a punta). Adentro, por LAN pelada y HTTP, la clave y el token viajan en
  claro. Mejora barata: **entrar por el nombre de Tailscale tambien desde casa**.
  TLS con Caddy queda para cuando se publique de verdad. Ver ESPECIFICACION §7 (3).
- **No publicar el puerto 8000 fuera del tailnet.** La API ya tiene auth (3a),
  pero igual: exponerla es innecesario.

## Notificaciones push (fase futura, ver 0019)

La **bandeja in-app ya esta** (0019). El push (avisos fuera de la app) queda:
- Service worker + `PushManager` + suscripciones (tabla nueva).
- Claves **VAPID**; el backend enviando los push.
- Requiere **HTTPS** (va de la mano con Caddy).
- Reusa los eventos que ya escriben en `notifications`: es otro canal del mismo aviso.

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
