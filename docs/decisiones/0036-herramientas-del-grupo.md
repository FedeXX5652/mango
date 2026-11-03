# 0036 - Herramientas del grupo

Estado: aceptada e implementada (1.15.0).
Fecha: 2026-11-03

## Contexto

Un grupo funciona igual que lo personal, de a varios (ESPECIFICACION 3.10).
Hasta la 1.14, de las herramientas personales el grupo tenia solo las
plantillas, y como una seccion de sus Ajustes. No tenia recurrentes ni metas,
aunque `recurring_rules` y `goals` ya traian `group_id` desde el esquema inicial,
sin uso.

## Decision

**Plantillas, recurrentes y metas son la misma pantalla en los dos espacios:**
`/plantillas` y `/grupos/<grupo>/plantillas`, y lo mismo con `recurrentes` y
`metas`. La pantalla recibe el grupo de la URL (`DelEspacio`); son secciones
comunes (`COMUNES`), asi que cambiar de espacio deja en la misma pantalla. Las
plantillas del grupo salen de sus Ajustes.

**Recurrente del grupo.**

- Es un **gasto** con una categoria del grupo. La paga **siempre quien la crea**,
  con una cuenta suya o con la conjunta de ese grupo (no la de otro): "la idea es
  que sea desde una misma cuenta siempre".
- Se genera como las personales, en el dispositivo (ESPECIFICACION 3.7), pero
  **solo en los de quien la creo**: baja a todos los miembros y el generador
  toma solo las propias. El movimiento va al grupo (`visibility = shared`) con
  el reparto por defecto del grupo (0026) entre los miembros de ese momento; los
  ids del reparto son deterministas, como el del movimiento, para que dos
  dispositivos mios no suban dos repartos.
- La ven todos (en su lista y en el calendario del grupo, como informacion),
  pero **la pausa o borra solo quien la creo**: usa una cuenta suya que los
  demas no ven. Para otro, la ruta da 404.
- Una recurrente personal no lleva una categoria del grupo.

**Meta del grupo.** La plata es de todos, asi que se sigue contra una **cuenta
conjunta del grupo** (su saldo sale del lente del grupo, como en
`CuentaConjunta`). Sin conjunta, la meta se crea igual y la pantalla dice como
crearla. La edita o borra cualquier miembro, como las plantillas del grupo.

**Deudas no van al grupo.** Lo que se deben los miembros ya es el balance, con
"Saldar". Una deuda del grupo con un tercero es rara; si aparece, se anota como
personal de quien la tenga. Es una diferencia que obliga lo compartido.

## Consecuencias

- La sync manda las recurrentes y metas del grupo por el stream `grupo`; las de
  `mio` pasan a ser solo las personales (`group_id IS NULL`), como las plantillas.
- Sin migracion: las columnas ya estaban. El cliente agrega `group_id` a
  `recurring_rules` en su esquema local.
- Quien se va del grupo deja de recibir sus reglas, asi que sus dispositivos
  dejan de generarlas.
