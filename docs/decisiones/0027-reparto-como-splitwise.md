# 0027 - Repartir un gasto como Splitwise: por partes y reparto por defecto del grupo

Estado: aceptada
Fecha: 2026-10-02

## Contexto

Desde la fase 3b.3.2 un gasto compartido se reparte en partes **iguales**
(eligiendo quiénes participan), en **montos exactos** o en **porcentajes**, y se
guarda el monto resuelto de cada miembro en `transaction_splits` (0015). Frente a
Splitwise faltaban dos cosas de uso diario en un hogar:

- **Repartir por partes**: "2 a 1" para quien vale por dos (una pareja con un
  hijo, una habitación más grande). Con porcentajes había que hacer la cuenta a
  mano (66,67 / 33,33).
- **Un reparto por defecto del grupo**: si en Casa todo se divide 60/40, cada
  gasto nuevo arrancaba en "Igual" y había que cambiarlo siempre.

Al revisar el editor apareció además un problema de fondo: el porcentaje se
resolvía con punto flotante (`Math.round(total * pct / 100)`) y el resto del
redondeo se le daba al **último** miembro. Si ese miembro tenía 0 %, le tocaba un
centavo que no le correspondía.

## Decision

### Modo "Partes"

El editor de reparto suma un cuarto modo, **Partes**: un entero por miembro. El
monto de cada uno es proporcional a sus partes. Igual, %, Exacto y Partes
conviven; lo que se guarda sigue siendo el monto resuelto por miembro (el modelo
de `transaction_splits` no cambia).

### Una sola forma de repartir, entera

Porcentajes y partes se resuelven con la misma función (`repartirPorPesos`,
`lib/reparto.ts`), **sin punto flotante** (regla 1):

- Los porcentajes se leen en **centésimas de punto** (33,33 % = 3333) y las
  cuentas se hacen con `BigInt`, exactas para cualquier monto.
- **Método del mayor resto**: cada uno recibe el piso de su cuota y los centavos
  que sobran van, de a uno, a los de mayor fracción; a igual fracción, al
  primero en el orden por id (el mismo que usa el balance para el "igual" por
  defecto, así lo que se ve es lo que se guarda).
- **Un peso 0 recibe 0, siempre.**
- Si todos tienen el mismo peso, es "igual entre todos": no se guardan filas,
  como antes.

### Reparto por defecto del grupo

`groups.default_split` (JSONB, opcional): `{user_id: partes}`. NULL = partes
iguales.

- Es **solo el punto de partida** del formulario: un gasto nuevo del grupo
  arranca en "Partes" con esos valores. Cada gasto se puede cambiar al cargarlo,
  y cada uno guarda su reparto resuelto. Cambiar el reparto del grupo **no
  toca** los gastos ya cargados.
- Se guarda en partes y no en porcentajes: 60/40 se escribe 60 y 40 (o 3 y 2), y
  "2 a 1" no necesita decimales.
- Lo edita **cualquier miembro**, como el nombre y el color (es un hogar, 0014).
  Va por la API (`PATCH /groups/{id}`), que valida que las claves sean miembros
  de hoy y que haya al menos una parte. Baja con la fila del grupo.
- Quien entra al grupo después de fijar el reparto arranca con 0 partes en el
  formulario: el editor lo nombra ("Carla queda afuera de este gasto") y se
  corrige ahí mismo.
- Sin reparto por defecto, pasar a "Partes" arranca con 1 para cada uno, como en
  Splitwise.

### Lo que no entra todavía: "pagó otro"

Cargar un gasto que **pagó otro miembro** ("Beto pagó la luz") cambia el modelo:
hoy el gasto es de quien lo carga, y su cuenta es privada (0021). Necesita una
decisión propia (quién lo puede editar, de qué cuenta salió). Queda en el
BACKLOG.

## Consecuencias

- Columna nueva `groups.default_split`, aditiva (0012): un cliente viejo no la
  conoce y no pasa nada.
- `transaction_splits` no cambia: el reparto sigue guardándose resuelto en
  centavos.
- Las columnas JSONB "NULL = por defecto" (`default_split`, `fx_manual`,
  `home_shortcuts`) se mapean con `none_as_null`: volver al valor de fábrica
  deja NULL de SQL y no un JSON `null`.
