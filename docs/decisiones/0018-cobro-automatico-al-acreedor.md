# 0018 - Cobro automatico al acreedor (ingreso pendiente por confirmar)

Estado: aceptada
Fecha: 2026-09-26

## Contexto

Con 0017 el deudor puede registrar un **pago real** (sale de su cuenta). Faltaba
la otra punta: que al **acreedor** le quede anotado el cobro en su cuenta, y que
se vea que **proviene de un pago de X**. La pregunta abierta era **a que cuenta**
asignarlo: el deudor no sabe en que cuenta lo recibio el acreedor.

## Decision

**El acreedor lo confirma; no se adivina la cuenta.** Cuando el deudor registra un
pago **real** (con `account_id`), el **servidor** le crea al acreedor un
**ingreso pendiente**:

- `owner_id` = acreedor, `kind='income'`, `status='pending'`, `source='api'`
  (nunca `manual`: la regla 4 lo prohibe, y esto lo genero el sistema).
- `account_id` NULL (lo elige el acreedor), `category_id` NULL.
- `payee = "Pago de <nombre del deudor>"` — asi se ve de quien viene.
- `settlement_id` apunta al pago que lo origino (link para la reversa).
- El id lo genera el **servidor**: no es algo que cargo el cliente, asi que no
  aplica la regla 5.1 (id del cliente).

El acreedor lo ve en **"Cobros por confirmar"** (en Inicio), elige **a que cuenta
entro** y con que **categoria**, y confirma. Recien ahi el ingreso pasa a
`confirmed` y suma a su saldo. Para permitir esa confirmacion, `TransactionUpdate`
acepta `status` con un unico valor posible, `confirmed`: el cliente puede
**confirmar** un pendiente, nunca ponerlo en pendiente (regla 4 intacta).

Un **"marcar saldado"** (sin cuenta, no mueve plata) **no** crea cobro: no entro
plata a ningun lado.

### Reversa

Si se **deshace** el pago: el cobro se borra **solo si sigue pendiente**. Si el
acreedor ya lo confirmo (le asigno cuenta), la plata ya la dio por recibida y el
movimiento **queda**. (Avisar de esto al acreedor queda para cuando exista el
sistema de notificaciones — ver trabajo futuro.)

### Sincronizacion

El cobro es una transaccion normal del acreedor: baja por su stream `mio`
(`SELECT * ... WHERE owner_id = auth.user_id()`). No hace falta tocar el stream de
grupo. `settlement_id` viaja como una columna mas.

## Consecuencias

- `transactions` + `settlement_id` (migracion aditiva).
- `TransactionUpdate` acepta `status='confirmed'` (confirmar un pendiente).
- El acreedor tiene una bandeja "Cobros por confirmar" y controla en que cuenta
  cae cada pago.
- **Futuro**: un sistema de **notificaciones** (bandeja in-app + push) para avisar
  "te llego un pago", "se deshizo un pago ya confirmado", etc. Es un subsistema
  aparte (service worker, suscripciones push, VAPID) y se decide/implementa solo.
- **Futuro**: conciliar aun mas — que confirmar el cobro no requiera recategorizar
  si no se quiere (una categoria "Transferencias/Cobros" por defecto).
