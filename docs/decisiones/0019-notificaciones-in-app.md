# 0019 - Notificaciones in-app (bandeja)

Estado: aceptada
Fecha: 2026-09-26

## Contexto

Varios eventos del grupo le importan a alguien que no esta mirando esa pantalla:
te llego un pago (0018), se deshizo un pago que ya habias confirmado (0017/0018),
te sumaron a un grupo. Hacia falta una forma de **avisar**. Se decidio hacerlo en
dos etapas: primero la **bandeja in-app** (esto); el **push** (fuera de la app)
despues, junto con el TLS/Caddy.

## Decision

Una tabla `notifications` por usuario. **Las crea el servidor** en los eventos; el
**cliente solo las marca leidas**. No las crea ni borra el cliente (como `users`).

- Campos: `user_id`, `type`, `title`, `body`, `link` (ruta a abrir), `read_at`
  (NULL = sin leer). El texto va **pre-renderizado en español** (title/body): es
  lo mas simple y la app es monolingue por ahora.
- **Sync:** bajan por el stream `mio` (`WHERE user_id = auth.user_id()`). El
  cliente escribe `read_at` y sube por PATCH; el conector bloquea PUT/DELETE de
  `notifications` (igual que `users`).
- **UI:** una campanita con contador de no leidos (header movil y barra de
  escritorio). Al abrir, la lista; tocar un aviso lo marca leido y navega a su
  `link`. Hay "marcar todas leidas".

### Eventos de esta etapa

- `pago_recibido`: el deudor registro un pago real → al acreedor "confirma a que
  cuenta entro" (se apoya en 0018).
- `pago_deshecho`: se deshizo un pago que el acreedor **ya habia confirmado** (el
  cobro queda; se avisa que revise).
- `miembro_agregado`: te sumaron a un grupo.

El helper que crea el aviso **no hace commit**: corre dentro de la transaccion del
evento, asi el aviso y el hecho se guardan juntos (o ninguno).

## Consecuencias

- `notifications` (tabla nueva), su stream en `mio`, su tabla en el cliente y el
  mapeo en el conector (solo PATCH).
- `TransactionUpdate` ya permitia confirmar (0018); nada nuevo ahi.
- **Futuro (push):** `PushManager` + service worker + claves VAPID + tabla de
  suscripciones + el backend enviando los push. Requiere HTTPS (Caddy). Reusa los
  mismos eventos que ya generan la fila en `notifications`: el push es otro canal
  del mismo aviso.
- **Futuro:** mas eventos (te quitaron de un grupo, un gasto compartido nuevo,
  presupuesto del grupo excedido).
