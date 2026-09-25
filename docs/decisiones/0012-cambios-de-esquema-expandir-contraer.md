# 0012 - Cómo se cambia el esquema sin perder escrituras en vuelo

Estado: aceptada
Fecha: 2026-09-15

## Contexto

La app es local-first y es una **PWA**. Dos consecuencias que mandan sobre
cualquier cambio de esquema:

1. **Hay escrituras en vuelo.** El usuario carga sin conexión; los cambios
   quedan en la cola local y suben cuando hay red. En el medio puede pasar un
   deploy. Entonces un cliente **viejo** manda payloads contra un servidor
   **nuevo**.
2. **El cliente se actualiza solo, pero no al instante.** El service worker está
   en `autoUpdate`: la versión nueva entra sin pedir permiso, pero puede haber
   una ventana corriendo la vieja.

Si el servidor nuevo rechaza un payload viejo, ese cambio se va a la bandeja de
rechazados (ver 0011) en vez de perderse. Pero la bandeja es la red, no el plan:
**el plan es que el rechazo no ocurra**.

Esto deja de ser teórico en fase 3, que trae un renombre (`email -> username`),
un reparto de buckets y validaciones nuevas.

## Decisión

**Todo cambio de esquema se hace de forma que un cliente una versión atrás
siga subiendo bien. Cuando eso no se puede en un paso, se parte en dos releases
separados en el tiempo: expandir y contraer.**

### Lo que se puede en un paso (aditivo)

- **Columna nueva opcional, con default.** El cliente viejo no la manda, el
  servidor pone el default. Seguro.
- **Sacar una columna.** Pydantic **ignora** los campos que no conoce (no hay
  `extra="forbid"` en ningún esquema, y no se agrega). El cliente viejo la sigue
  mandando y el servidor la descarta. Seguro. Verificado en la poda del backend.
- **Aflojar una validación** (aceptar más que antes). Lo viejo sigue entrando.

### Lo que NO (necesita expandir/contraer)

- **Renombrar una columna.**
- **Columna nueva obligatoria** sin default.
- **Apretar una validación** (rechazar lo que antes entraba).
- **Índice único nuevo.** Puede fallar contra datos que ya existen y vuelve
  inválidas escrituras que antes pasaban. Es el caso de la deduplicación de
  fase 2.
- **Cambiar el dueño de filas en masa** (migrar del usuario semilla al real).
- **Repartir buckets de sincronización.** Una fila que pasa de un bucket a otro
  puede desaparecer de la copia local de un dispositivo. Mismo modo de falla que
  cambiar de tabla en las reglas de sync, pero a nivel de fila.

### El patrón: expandir, después contraer

Renombrar `email -> username`, de ejemplo:

1. **Expandir (release N).** Se agrega `username`. Se rellena desde `email`. El
   servidor **acepta las dos**: lee `username` si viene, si no cae a `email`. El
   cliente nuevo escribe `username`. El cliente viejo sigue mandando `email` y
   entra igual.
2. **Esperar.** Hasta que ningún cliente activo mande `email`. En una app
   familiar es "cuando todos abrieron la app nueva al menos una vez".
3. **Contraer (release N+1).** Se borra `email` y la tolerancia. Ya nadie lo
   manda.

Cuesta un release de paciencia. No cuesta framework.

### La regla dura, la que sostiene todo

**Un campo nunca cambia de significado. Si el significado cambia, es un nombre
nuevo.**

Ejemplo: si `amount` pasara de centavos a unidades, un payload viejo
`{amount: 1580}` es **ambiguo** —¿son 1580 centavos o 1580 pesos?— y ninguna
regla automática puede saberlo. La salida no es adivinar: es que eso no se hace.
Se agrega `amount_v2` (o el nombre que sea), y `amount` queda con su significado
para siempre.

Esto es lo que va a hacer viable, más adelante, un sistema de transformaciones
de la cola (el "Alembic para local-first"): puede traducir `email` a `username`
porque el dato es el mismo con otro nombre. No podría desambiguar un `amount`
que cambió de unidad. Por eso la regla es innegociable.

### Orden de despliegue

- **Servidor primero, cliente después.** Nunca al revés: un cliente nuevo contra
  un servidor viejo manda lo que el viejo no entiende.
- **Migración de base**: `alembic upgrade head` en el arranque del contenedor
  (idempotente; correr de más no hace nada).
- **Si el cambio toca una tabla sincronizada**, alinear las cuatro cosas en el
  mismo deploy: migración, `sync-config.yaml`, **reiniciar PowerSync** (lee el
  archivo al arrancar) y el `AppSchema` del cliente. Una tabla que no esté en las
  cuatro no llega, y el cliente pierde su copia local en el próximo checkpoint.

## Cómo se verifica: el banco de compatibilidad

Que un cliente viejo siga subiendo bien no se confía a la disciplina sola: se
prueba. En dos caras.

**Payloads (todos los días, en `make test`).** Lo que rompe en un deploy es la
FORMA del JSON que el cliente manda, no el cliente entero. `tests/compat/` guarda
fixtures con esa forma —secuencias auto-contenidas de escrituras, tal cual las
arma el conector— y las reproduce contra la API de hoy afirmando que entran.
Hoy hay uno, el baseline. Cuando llegue un cambio no aditivo, se agrega el
fixture con la forma vieja y una prueba de que el servidor nuevo lo acepta (cara
"expandir") o que el normalizador lo traduce. Verificado: un campo obligatorio
nuevo pone el banco en rojo con 422.

**Cliente entero (manual, raro).** `scripts/banco-compat.mjs <git-ref>` compila
y sirve el frontend de una version anterior apuntando a la API de hoy. Es para
lo que los payloads no cubren: sobre todo la migracion de la base local que hace
PowerSync cuando cambia el `AppSchema`. Se corre a mano cuando un cambio lo
amerita.

## Consecuencias

- Los cambios aditivos son la mayoría y no necesitan ceremonia: se despliega y
  listo.
- Los no aditivos cuestan dos releases. Es un costo de calendario, no de código,
  y hay que planificarlos con esa cadencia.
- La bandeja de rechazados (0011) queda como **red**, para el caso en que
  igual se cuele un rechazo: un despliegue apurado, un cliente que estuvo
  semanas sin abrir. No reemplaza a esta disciplina; la respalda.
- El sistema de transformaciones de la cola se construye cuando aparezca el
  primer caso real (el renombre de fase 3a), no antes: hoy sería framework vacío.
