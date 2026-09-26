# 0016 - Cuenta conjunta y presupuesto del grupo

Estado: aceptada
Fecha: 2026-09-25

## Contexto

0014 dejo anotada la **cuenta conjunta** (una caja de ahorro a nombre de los dos)
como trabajo futuro, modelada como una cuenta propiedad del grupo. 0015 dejo
pendiente el **presupuesto del grupo**. Esta decision los implementa.

## Decision

### Cuenta conjunta = cuenta del grupo

Una cuenta puede ser **personal** (`owner_id`) o **conjunta** (`group_id`,
`owner_id` NULL), igual que las categorias (0014). Para eso `accounts.owner_id`
pasa a ser **nullable** (aflojar una validacion: aditivo, un paso, ver 0012).

- La crea **cualquier miembro**; la ven todos (baja por el stream `grupo` por
  `group_id`). Su saldo es el mismo calculo que una cuenta personal (0005).
- **No aparece en las vistas personales** (Inicio, Cuentas filtran
  `owner_id IS NOT NULL`): la plata conjunta no es patrimonio personal de nadie.
  Vive en la pantalla del grupo.

### Un gasto pagado con la conjunta no genera deuda

**Principio (extiende 0014):** el balance "quien le debe a quien" solo cuenta lo
que cada uno puso **de su bolsillo** (cuentas personales). La plata de la cuenta
conjunta **ya es de todos**: gastarla no es que uno le preste al otro.

- Un gasto compartido pagado desde la conjunta **suma al total del grupo y al
  presupuesto**, pero **no entra al balance de deudas**.
- Se marca con `transactions.paid_from_group` (booleano denormalizado). Hace
  falta el flag y no deducirlo de `account_id` porque a los otros miembros **no
  les viaja `account_id`** (privacidad, 3b.2); el flag si viaja en el gasto
  compartido.

La alternativa (repartir igual que cualquier gasto) contaria la plata dos veces:
si uno fondeo la conjunta y ademas se le divide lo que sale de ahi. Se descarto.

Fondear la conjunta (transferir de lo personal a la conjunta) y el reparto de esos
aportes es trabajo futuro: hoy la conjunta arranca en cero y su saldo refleja lo
que entra y sale por movimientos.

### Presupuesto del grupo

`budgets` ya tenia `group_id` (esquema original). Un presupuesto del grupo es un
tope mensual sobre una **categoria del grupo**, contra lo que el grupo gasto ese
mes. Lo pone/edita **cualquier miembro**; baja por `grupo` (por `group_id`). Es
el mismo modelo de sobres que el personal (0004), con ambito de grupo.

## Consecuencias

- `accounts.owner_id` nullable; `transactions.paid_from_group` nuevo (los dos
  aditivos). `settlements` ya existia (0015).
- El stream `grupo` sincroniza: cuentas del grupo (enteras) y el flag
  `paid_from_group` en el gasto compartido; los presupuestos del grupo por
  `group_id`.
- `lib/grupo` excluye del balance los gastos con `paid_from_group`, pero los
  suma al total y al presupuesto.
- Queda afuera: **fondear la conjunta** (aportes y su reparto).
