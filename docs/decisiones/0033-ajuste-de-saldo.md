# 0033 - Ajuste de saldo: la diferencia que no se puede identificar

Estado: aceptada e implementada (1.10.0).
Fecha: 2026-10-20

## Contexto

Por bien que se cargue todo, una cuenta se descuadra: una comisión que nadie
anotó, un redondeo, un gasto olvidado. Money Manager lo resuelve con "Modificar
saldo": se escribe el saldo que de verdad hay y la diferencia queda como un
movimiento de la categoría "Ajuste". Se usa seguido, y se pidió igual en
Mango.

Hasta la 1.9.0 Mango tenía solo el saldo inicial de la cuenta. Cambiarlo para
cuadrar mueve toda la historia hacia atrás (los saldos de cada fecha pasada) y
no deja rastro de cuándo ni cuánto se ajustó.

## Decisión

### Un movimiento más, en una categoría del sistema

El ajuste es un **ingreso o un egreso** de la cuenta por la diferencia, con fecha
de cuando se ajusta, en la categoría **"Ajuste de cuenta"**. Sube el saldo: un
ingreso; baja: un egreso; igual: no se anota nada.

- Son **dos categorías del sistema** (0026), una por kind:
  `system_key` = `ajuste_ingreso` y `ajuste_egreso`. La clave es única por
  usuario, así que no puede ser una sola.
- **Las crea el servidor de antemano**: la migración `fc60ad494803` para los
  usuarios de antes y el login para cualquier otro (`asegurar_ajustes`). El
  ajuste se carga sin conexión con la categoría que ya bajó la sincronización;
  crearla a demanda en el servidor (como "Reintegros de grupo") no sirve acá.
- **No se ven ni se tocan**: no están en la lista de Categorías ni en ningún
  selector (alta, detalle, plantillas, recurrentes, sobres, cobros:
  `SIN_AJUSTE`), y el servidor rechaza editarlas o borrarlas. En el detalle de un
  ajuste la categoría se muestra fija y el movimiento no se pasa a un grupo.
  Borrar el ajuste sí se puede: es deshacerlo.
- **En los informes sí aparecen**: es plata que entró o salió, y si no estuviera
  los totales no cerrarían con los saldos.

### La pantalla

En **Cuentas**, tocar una cuenta abre su edición; ahí, junto a archivar y
eliminar, está **"Ajustar saldo"** (no en una archivada). Abre encima una hoja
con la calculadora del alta **arrancando en el saldo que calcula Mango**. Se
escribe el que de verdad hay, o se hace la cuenta sobre ese número ("+ 1500"),
y la hoja dice qué se va a anotar ("Se anota un ingreso de $ 1.500,00"). El
saldo de una tarjeta es negativo: la calculadora suma la tecla **"±"**
(`conSigno`), que el alta no muestra porque un monto es siempre positivo.

Se dice **"saldo"** y no "balance": en Mango, "Balance" es el de un grupo (quién
le debe a quién).

## Consecuencias

- Un ajuste suma en las estadísticas del mes en que se hizo, como en Money
  Manager. Un descuadre grande se ve.
- Un cliente viejo (1.9.0) ve las dos categorías del ajuste en sus selectores
  hasta que se actualiza: no rompe nada y la PWA se actualiza sola.
- El saldo inicial queda para lo que es: con cuánto arrancó la cuenta en Mango.
