# 0017 - Saldar deudas (marcar vs pago real) y fondeo de la conjunta

Estado: aceptada
Fecha: 2026-09-26

## Contexto

0015 introdujo el `settlement` como registro de un pago que ajusta el balance del
grupo. Al usarlo aparecieron dos necesidades:

1. Distinguir **"marcar saldado"** (la deuda se salda por fuera, o es chica y los
   dos la dan por saldada — no mueve plata) de un **pago real** (sale plata de la
   cuenta del que paga).
2. **Fondear la cuenta conjunta**: meter plata personal en la caja comun.

Ademas, un bug: al saldar, la deuda **volvia a aparecer sola**.

## El bug del "vuelve la deuda"

Sintoma: se toca Saldar, queda "al dia", y al rato reaparece la deuda. Causa: el
`settlement` se escribia local y **subia bien (201)**, pero el `sync-config` que
tenia cargado el servicio PowerSync en ese momento **no incluia la tabla en
ningun stream**. Al confirmar el checkpoint, PowerSync descarta la copia local de
lo que no esta en ningun bucket (ver la trampa 1 del `sync-config.yaml`), y la
deuda vuelve. Se corrige asegurando que `settlements` este en el stream `grupo`
(y en `mio` para el pagador) y **reiniciando PowerSync**. Regla: tras tocar una
tabla del sync, contar filas, no mirar la pantalla.

## Decision

### Saldar tiene dos formas

- **Marcar saldado** (default, cualquier miembro): un `settlement` sin cuenta.
  Documentado y **reversible** (Deshacer). Ajusta el balance del grupo; **no
  mueve plata** de ninguna cuenta. Para deudas chicas o saldadas por fuera.
- **Registrar pago** (solo el deudor): un `settlement` con `account_id` (+ medio
  opcional). Sale de **su** cuenta y **baja su saldo**. Se puede **pagar por
  partes**: el monto es editable y puede ser menor a la deuda; varios pagos
  parciales se acumulan.

Modelo: el `settlement` gana `account_id` y `payment_method_id` (nullables). Si
vienen, es pago real y se **resta del saldo** de esa cuenta (se suma a la resta de
`transactions` en el calculo de saldo). Solo la cuenta del **from_user** (el que
paga) es valida: no se mueve plata ajena. La plata que **recibe** el acreedor es
asunto suyo (la registra o no en su cuenta); aca importa que la deuda del grupo
baje y que al deudor le salga de su bolsillo.

**Privacidad:** `account_id`/`payment_method_id` de un pago **no viajan** a los
otros miembros (como en las transacciones, 3b.2). El pagador los recibe enteros
por su stream `mio`; al grupo le llega el pago sin cuenta ni medio.

### Fondear la conjunta = una transferencia

Meter plata en la caja comun es una **transferencia** normal de una cuenta
personal a la cuenta conjunta (que ya es una cuenta, 0016). No hace falta nada
nuevo: la validacion de transaccion ya acepta como destino una cuenta del grupo
del que sos miembro. Sube el saldo de la conjunta; no toca el balance de deudas
(las transferencias no son gasto).

## Consecuencias

- `settlements` + `account_id`, `payment_method_id` (migracion aditiva).
- El saldo de una cuenta personal resta tambien los pagos reales hechos desde ella.
- `mio` sincroniza mis pagos enteros; `grupo`, los pagos sin cuenta/medio.
- Queda como MVP: el acreedor no ve el pago reflejado en SU cuenta
  automaticamente (lo registra el si quiere). Conciliar las dos puntas es futuro.
