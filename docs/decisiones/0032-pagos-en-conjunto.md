# 0032 - Pagos en conjunto: quién puso cuánto en un gasto compartido

Estado: aceptada e implementada (1.8.0).
Fecha: 2026-10-19

## Contexto

Hasta la 1.7.0, quien carga un gasto compartido es, por definición, quien lo
pagó entero (0015, 0027 lo dejó afuera a propósito: "pagó otro" cambia el
modelo). En la vida real un gasto lo pagan entre varios: la mitad cada uno en la
caja, o una parte la conjunta y otra yo, o lo pagó otro y yo tengo el ticket.

Un gasto compartido queda definido por tres cosas: **el total, cuánto puso cada
uno y cuánto le toca a cada uno** (el modelo de Splitwise). Lo que cada persona
aporta al balance es *lo que puso − lo que le toca*.

Lo propio de Mango son las cuentas: lo que puso cada uno salió de **su** cuenta,
que es privada (0021) y solo esa persona puede elegir.

Decisiones del usuario: G1 (el balance cuenta lo que puso otro desde que se
carga; si lo rechaza queda marcado para corregir), G2 (lo edita quien lo cargó,
y cada uno que pagó solo su parte), rechazo reversible (2026-10-03), y Q1-Q4
(2026-10-19): si quien cargó cambia lo que puso otro ya confirmado, se le vuelve
a pedir confirmación; borrar el gasto borra los pagos de los demás, confirmados
o no; cualquier miembro puede cargar un gasto que pagaron otros; la cuenta
conjunta puede ser una de las que pagaron.

## Decisión

### El gasto sigue siendo uno, con su total

La fila de `transactions` del gasto compartido (de quien lo cargó) conserva
`amount` = **el total**: el resumen del grupo, el presupuesto, el reparto
(`transaction_splits`) y los avisos siguen leyendo el total, sin cambios.

- **`transactions.amount_owner`** (nuevo, NULL): lo que puso quien lo cargó, si
  pusieron otros. NULL = lo pagó entero, como hasta ahora. Puede ser 0 (lo pagó
  otro y yo tengo el ticket): entonces no hace falta cuenta.
- La cuenta de quien lo cargó descuenta `COALESCE(amount_account, amount_owner,
  amount)`: lo que salió de **su** cuenta. `amount_account` (0005) sigue siendo
  lo debitado de verdad si la cuenta está en otra moneda.
- Lo personal de quien lo cargó (sus estadísticas, la lista) usa lo que puso.

### Quién más puso: `transaction_payers`

Tabla nueva, una fila por cada otro que puso plata (id del cliente, regla 2):

- `transaction_id`, `amount` (centavos, en la moneda del gasto);
- `user_id` para un miembro, **o** `account_id` para la **cuenta conjunta** del
  grupo (CHECK: uno de los dos);
- `status`: `pending`, `confirmed` o `rejected`. Lo mantiene el servidor, espejo
  del pago del miembro (abajo). La conjunta nace `confirmed`: es de todos.

Las crea y edita **quien cargó el gasto** (como los splits). La suma
`amount_owner + Σ amount = amount` la garantiza el cliente: las filas llegan de
a una por la sync (como los splits, 0015).

Baja por el stream del grupo (todos los miembros la ven).

### El pago de cada miembro: un movimiento suyo por confirmar

Por cada fila de un miembro, **el servidor le crea a esa persona un movimiento**
(como el cobro por confirmar de 0018):

- mismo id que la fila de `transaction_payers` (se encuentran sin buscar);
- `owner_id` = quien pagó, `kind = expense`, privado, `amount` = lo que puso,
  la categoría del gasto, `paid_for_id` = el gasto compartido (columna nueva);
- `status = pending`, `pending_reason = 'pago_a_confirmar'`, `source = 'api'`,
  sin cuenta.

Esa persona lo responde:

- **"Sí, la pagué"**: elige la cuenta (y el monto debitado si es de otra moneda)
  y queda `confirmed`. Recién ahí descuenta de su saldo.
- **"No la pagué"**: queda `rejected`. El balance lo sigue contando como se cargó
  (G1) y el gasto queda **en revisión** hasta que quien lo cargó lo corrija o la
  persona cambie su respuesta.
- **Se cambia cuando quiera**, desde el gasto ("Cambiar"): de rechazado a pagado,
  o al revés.
- **"Deshacer"**, justo después de "No la pagué", lo vuelve a pendiente. Es el
  único caso en que el cliente pone `pending`, y solo en un pago a confirmar
  (regla 4: una carga manual nunca queda pendiente).

Del pago, quien pagó solo toca la cuenta y la respuesta (G2); no se borra: se
responde. El resto (monto, fecha, categoría, comercio) lo define el gasto, y
cuando quien lo cargó lo cambia, el pago lo sigue.

El estado del movimiento se copia a la fila de `transaction_payers` (la ven
todos; el movimiento es privado).

### Avisos (familia "grupos", como los pagos de una deuda)

- `pago_por_confirmar` al que pagó: "Ana cargó $12.000 en Super: pusiste $6.000.
  Confirmá de qué cuenta salió". **En Android trae un botón**, "Pagada con
  <cuenta>", con la última cuenta en la moneda del gasto con la que esa persona
  pagó algo. Lo autoriza un permiso de un solo uso (`payment_action_tokens`,
  ruta `/payment-actions`), como los de los recordatorios (0030): el service
  worker manda cada botón a la ruta que trae el aviso. Solo confirma un pago que
  sigue pendiente. "No la pagué" no va en el aviso: se toca de casualidad.
  Sin una cuenta para proponer, no hay botón y el aviso abre la app.
- Quien puso plata no recibe además el "Gasto nuevo" (0019) de ese gasto.
- `pago_rechazado` a quien lo cargó, **30 segundos después** de rechazar y solo
  si sigue rechazado: deshacer en ese rato no avisa a nadie.
- `pago_cambiado` al que pagó, si quien lo cargó cambió lo que puso (vuelve a
  pedir confirmación, Q1) o lo sacó de los que pagaron / borró el gasto (Q2).

### Lo que cambia quien lo cargó

- Cambia lo que puso un miembro: el movimiento de esa persona toma el monto nuevo
  y **vuelve a pendiente** (Q1), con aviso.
- Cambia la **moneda** del gasto: lo debitado de cada cuenta era de la moneda
  vieja, así que cada pago **vuelve a pendiente** (sin monto debitado ni
  cotización), con aviso.
- Un pago confirmado no vuelve a pendiente desde la app: "pendiente" es solo
  deshacer un "no la pagué".
- Saca a un miembro de los que pagaron, o **borra el gasto**: se borran sus
  movimientos, confirmados o no (Q2), con aviso.

### El balance del grupo

`puso` de cada miembro = lo que puso como dueño (`COALESCE(amount_owner,
amount)`) + sus filas de `transaction_payers` (en cualquier estado: G1).

**La cuenta conjunta** que puso `X` de un total `T` no genera deuda (0016): la
parte de cada uno se calcula sobre `T − X` (mismo reparto, achicado por el
mayor resto). El caso de siempre, todo de la conjunta (`paid_from_group`), es
`X = T`.

### Cuenta conjunta

El saldo de la conjunta descuenta también sus filas de `transaction_payers`.

### En la app

- **"¿Quién pagó?"** en el alta y en el detalle de un gasto del grupo, debajo del
  reparto: "Lo pagué yo" (por defecto) o "Entre varios", con un monto para vos,
  cada miembro y la conjunta, y lo que falta o sobra para cerrar con el total.
  Al editar, cada miembro dice si confirmó, falta que confirme o dice que no
  pagó.
- **"Pagos por confirmar"** en el Inicio: lo que puse en gastos de otros, con la
  última cuenta ya elegida ("La pagué con Efectivo"), "No la pagué" abajo como
  texto y "Deshacer" durante 30 segundos.
- **El detalle del gasto** (para los demás) dice "Pagó: entre varios", quién puso
  cuánto y su estado, "en revisión" si alguien dice que no pagó, y "Tu parte"
  con "Cambiar".
- **Lo personal usa lo que puse**: la lista, el Inicio, las estadísticas y el
  presupuesto personal de quien cargó el gasto ven lo suyo, no el total. Quien
  puso su parte la ve como un gasto suyo, con la categoría del grupo.
- **Entre varios va con una cuenta en la moneda del gasto**: lo que sale de mi
  cuenta es mi parte, y su monto debitado en otra moneda queda para después.
- Lo que puso la conjunta va en su línea, nunca como la cuenta de quien lo carga.

## Consecuencias

- Migración: `transactions.amount_owner`, `transactions.paid_for_id`, tabla
  `transaction_payers`; `tx_confirmed_chk` se afloja (sin cuenta si
  `amount_owner = 0`): aditivo (0012).
- Sync: `transaction_payers` por el stream del grupo; `group_transactions`
  suma `amount_owner`. Reiniciar PowerSync en el deploy.
- Ruta nueva `/transaction-payers` (POST, PATCH, DELETE idempotente) y
  `/payment-actions` (el botón del aviso, sin sesión). Migraciones
  `74f278103c95` y `c472860db607`.
  `TransactionUpdate.status` acepta `rejected` y `pending`, solo en un pago a
  confirmar. `TransactionCreate.account_id` es opcional: lo exige el servidor
  salvo que `amount_owner` sea 0.
- Un cliente de antes de la 1.8.0 ve el total y no sabe de los demás pagadores:
  mientras no se actualice, su balance trata el gasto como pagado entero por
  quien lo cargó.
