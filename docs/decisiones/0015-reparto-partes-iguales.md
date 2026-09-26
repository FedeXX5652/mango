# 0015 - Reparto del grupo: partes iguales, primer paso hacia el settlement

Estado: aceptada
Fecha: 2026-09-25

## Contexto

El grupo ya muestra los gastos compartidos y su taxonomia (0014). El payoff que
falta —y el norte que puso el usuario— es "algo como Splitwise": saber **cuanto
gasto el grupo** y **quien le debe a quien**. Construirlo entero (splits
desiguales por gasto, registro de pagos que salda un balance) implica esquema
nuevo y varias decisiones. Antes de eso hay una version util que no necesita
nada de eso.

## Decision

**Fase 3b.3.1 (esta): resumen y balance en partes iguales, de solo lectura.**

- El resumen se **calcula en el cliente** (`lib/grupo.ts`) sobre los gastos
  compartidos que ya bajaron por la sync. **No hay endpoint ni tablas nuevas.**
- El reparto es **en partes iguales entre todos los miembros del grupo**: es el
  default de Splitwise y lo mas simple correcto. La parte de cada uno = total / N;
  el resto de la division se reparte de a un centavo para que el balance **cierre
  en cero** (regla 1, todo en centavos).
- Balance de un miembro = lo que **puso** (gastos que pago, por `owner_id`) menos
  su **parte**. Positivo: le deben. Negativo: debe.
- "Como saldar": se sugiere una lista minima de pagos (algoritmo goloso, empareja
  al que mas debe con el que mas le deben). No es el optimo teorico (es NP), pero
  da pocos pagos y siempre correctos.
- **No se mezclan monedas**: un resumen por cada moneda que aparezca. No hay una
  cotizacion del grupo.
- Periodos: "este mes" y "todo". Los gastos/categorias son del periodo; el
  balance de "todo" es acumulado.

## Lo que queda afuera (siguientes pasos)

- **Splits desiguales por gasto** (Ana paga el 70%, Beto el 30%; o excluir a
  alguien de un gasto). Necesita una tabla `transaction_splits` y un selector en
  el alta. Con eso, la "parte" deja de ser total/N y pasa a ser la suma de los
  splits de cada uno.
- **Registro de pagos / liquidacion persistida.** Hoy "como saldar" es una
  sugerencia que se recalcula; el balance nunca se borra porque no hay forma de
  anotar "Beto le pago $X a Ana". Anotar ese pago (una fila mas, tipo settlement)
  es lo que hace que un saldo baje a cero de verdad. Es el corazon de Splitwise y
  va aparte, con su decision.
- **Cuenta conjunta** (cuenta propiedad del grupo, ver 0014): ortogonal a esto.

## Estado

- 3b.3.1 (resumen + balance en partes iguales): HECHA.
- 3b.3.2 (splits desiguales: igual/exacto/%): HECHA. Se guardan en
  `transaction_splits`; el balance usa el split del gasto, o cae a partes iguales.
- 3b.3.3 (registro de pagos): HECHA. Tabla `settlements`; "Saldar" registra el
  pago y el balance lo descuenta; se puede deshacer. Cualquier miembro.

Queda afuera todavia: presupuestos del grupo y la cuenta conjunta (ver 0014).

## Consecuencias

- Se entrega ya lo mas visible del grupo sin tocar el esquema: cuanto se gasto,
  en que, quien puso, y quien deberia pagarle a quien para quedar a mano.
- El modelo queda encaminado: cuando entren los splits, solo cambia como se
  calcula "la parte"; cuando entre el registro de pagos, se restan del balance.
- La logica vive en una funcion pura testeada (`lib/grupo.ts`), asi el dia que se
  agreguen splits/pagos se extiende con pruebas sin tocar la UI.
