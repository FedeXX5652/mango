# 0035 - Nombre por grupo

Estado: aceptada e implementada (1.12.1).
Fecha: 2026-11-02

## Contexto

Cada persona tiene un solo nombre en Mango (`users.display_name`), el mismo en
todos sus grupos. Pero una misma persona se llama distinto segun con quien:
"Mamá" en el grupo de la familia, "Ana" en el de la casa, un apodo en el de los
amigos. Con un solo nombre, el balance del grupo dice algo que en ese grupo
nadie usa.

## Decision

**Cada miembro elige como se llama en cada grupo, y lo ve todo el grupo.**

- Es una columna de la membresia, `group_members.alias`, opcional. NULL = su
  nombre de Mango. No es una tabla aparte: es un dato de "esta persona en este
  grupo", que es exactamente lo que es la fila de `group_members`.
- **Cada uno edita el suyo, y nadie el de otro.** La ruta es
  `PATCH /groups/<grupo>/members/me`: no lleva el id de nadie, asi que no hay
  forma de pedir el de otro. Si no sos del grupo, 404.
- **Lo ve todo el grupo, en todos lados**: los gastos, el balance, el calendario,
  los pagos por confirmar y los avisos que arma el servidor ("Fefi cargó $ 100").
  En tus otros grupos no cambia. En la vista de uno mismo sigue diciendo "Vos".
- Se recorta, tiene de 1 a 40 caracteres, y vacio vuelve al nombre de Mango.
  No puede ser el nombre con que ya figura otro miembro del mismo grupo (su
  alias o, si no tiene, su nombre de Mango), sin distinguir mayusculas: dos
  "Ana" en un balance no se distinguen.

### Por la API, no por la cola de sync

La membresia se escribe por la API (agregar, sacar), no por la cola de subida:
el cliente no tiene permiso de escribir `group_members`, y darselo para una sola
columna de una sola fila abriria la puerta al resto. El alias sigue el mismo
camino: necesita conexion, y sin ella el boton se apaga y lo dice (DESIGN.md 7).
Baja a los dispositivos por la sync de siempre (`group_members` ya viaja entera).

### Una sola regla para el nombre

En el cliente, toda consulta que une `group_members gm` con `member_profiles u`
pide `NOMBRE_EN_GRUPO` (`lib/grupo.ts`, `COALESCE(gm.alias, u.display_name)`).
En el servidor, `nombres_por_grupo` / `nombre_en_grupo` (`crud/group.py`). Si una
pantalla arma el nombre por su cuenta, el alias deja de verse ahi.

## Opciones descartadas

- **Que cualquiera ponga el alias de cualquiera** (como un contacto del
  telefono): cada uno veria nombres distintos para la misma persona, y el aviso
  que arma el servidor no sabria cual usar. Se pidio uno solo, visible para
  todos.
- **Que lo ponga el dueño del grupo**: el nombre es de la persona; el dueño
  administra quien esta, no como se llama.

## Consecuencias

- Aditivo (0012): un cliente viejo ignora la columna y sigue mostrando el nombre
  de Mango hasta actualizarse.
- En Ajustes del grupo, la lista de miembros muestra el alias y, debajo, "En
  Mango: …", para que quien recien entra sepa quien es "Fefi".
- Quien se va y vuelve conserva su alias: la fila de la membresia se reactiva.
