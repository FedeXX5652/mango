# 0009 - Como se particiona la sincronizacion

Estado: aceptada
Fecha: 2026-09-14

## Contexto

La sincronizacion se definia con **un bucket global**: cada dispositivo que se
conectaba recibia *todas* las filas, de cualquier dueño. Con un solo usuario no
se notaba, pero no es una simplificacion temporal: es lo contrario de lo que la
fase 3 necesita, y el momento de arreglarlo es **ahora**, con una persona y una
base que se puede borrar. Migrar reglas de sincronizacion con varias personas y
datos reales es donde se pierde informacion.

El disparador concreto fue querer que las **preferencias** (moneda base, tema,
monedas manuales) viajen entre dispositivos y se puedan cambiar sin conexion.
Eso pedia sincronizar `users`, y sincronizar `users` sin particionar primero
hubiera sido ponerle una cerradura a una puerta sin pared.

## Decision

### 1. Un stream por usuario, parametrizado por el token

El token que emite `/sync/token` ya lleva el id en `sub`, asi que no hace falta
esperar al login de fase 3 para partir los datos:

```yaml
streams:
  mio:
    auto_subscribe: true
    queries:
      - SELECT * FROM accounts WHERE owner_id = auth.user_id()
      ...
```

Todo en **un** stream con varias consultas, no varios streams: cada combinacion
de stream y parametro es un bucket, y conviene tener pocos.

**Esto no es autenticacion.** Hoy la API firma el token del usuario semilla y
cualquiera que llegue a la API puede pedirlo. Lo que resuelve es la particion,
que es la mitad de lo que fase 3 necesita; la otra mitad es un stream de grupo
parametrizado por la tabla de miembros, que va a **convivir** con este sin
reemplazarlo.

### 2. Las tablas de union llevan dueño propio

`transaction_tags` y `payment_method_accounts` lo deducian de su fila padre.
Ahora lo tienen propio, porque **las consultas de sincronizacion no hacen JOIN**.
Sin la columna solo quedaban dos salidas: dejarlas globales —y filtrarle a cada
persona las etiquetas de los movimientos ajenos— o no sincronizarlas.

Es redundante contra el padre y esta bien que lo sea: es el precio de que el
filtro se pueda expresar.

**Queda abierto para fase 3**: cuando existan los movimientos compartidos, las
etiquetas de un movimiento compartido van a tener que seguir la **visibilidad
del movimiento**, no el dueño de la etiqueta. La columna sirve para el stream
personal; el stream de grupo va a necesitar su propia regla.

### 3. Las cotizaciones son compartidas, a proposito

`exchange_rates` no tiene dueño y no se lo vamos a inventar. El dolar del 12/09
es el mismo para todos, y que una persona cargue el MEP y lo vean las demas es
la gracia, no una fuga. Va en un stream global aparte.

Esto contesta la pregunta que 0005 dejaba abierta.

### 4. `users` se sincroniza con las columnas contadas

```yaml
- SELECT id, display_name, base_currency, theme_id, color_scheme, fx_manual
  FROM users WHERE id = auth.user_id()
```

**`password_hash` no esta en la lista, y por eso no puede salir del servidor.**
No es una lista negra que alguien tenga que acordarse de actualizar: es que no
se selecciona. Si mañana se agrega una columna sensible a `users`, no llega sola
al dispositivo; hay que agregarla a mano.

Del lado de la subida, el conector **solo manda PATCH** para esa tabla y
descarta altas y bajas: crear o borrar un usuario no es cosa del cliente. El
servidor expone unicamente `PATCH /users/{id}`, que contesta 404 si el id no es
el del token.

`fx_manual` es JSONB en Postgres y **texto** en SQLite, porque SQLite no tiene
arrays. La subida manda ese texto, asi que el esquema del servidor acepta tanto
la lista como el JSON de la lista. La costura se cose en el servidor, no en el
cliente, que manda lo que su base tiene.

### 5. Formato: Sync Streams, no `bucket_definitions`

Se migro de paso. PowerSync sigue soportando el formato viejo pero lo marca como
legacy, y como habia que reescribir el archivo entero para partirlo por usuario,
escribirlo en el formato viejo para reescribirlo despues era trabajo tirado.

La migracion se hizo en dos pasos verificables: primero traducir el formato sin
cambiar comportamiento, contando filas tabla por tabla; recien despues cambiar
la particion. Asi, si algo dejaba de llegar, se sabia cual de los dos cambios
fue.

## Consecuencias

- Las preferencias se leen y escriben **local**: cambiar la moneda base funciona
  sin conexion y viaja entre dispositivos. Las excepciones al local-first bajan
  de tres a dos (el CSV y el refresco de cotizaciones, las dos inherentes).
- `GET /users/me` desaparece: el cliente lee la fila de su base local.
- Un stream **no se auto-suscribe por defecto**. Sin `auto_subscribe: true` la
  tabla deja de llegar y la app la muestra vacia **sin ningun error**. Es el modo
  de fallar mas silencioso que tiene esto: despues de tocar el archivo hay que
  contar filas, no mirar la pantalla.
- Cambiar las definiciones obliga a reiniciar el servicio y re-sincronizar los
  clientes.
