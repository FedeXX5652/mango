# 0011 - Que pasa con una subida que el servidor rechaza

Estado: aceptada
Fecha: 2026-09-15

## Contexto

La app escribe **local primero** y PowerSync sube los cambios en segundo plano.
Cuando una subida falla, hay dos casos distintos:

- **5xx o sin conexion**: no es culpa del cambio, es del momento. El conector lo
  relanza y PowerSync reintenta solo. No se pierde nada.
- **4xx**: el servidor rechaza el cambio en si (una validacion de dominio, un
  campo que quedo invalido). Reintentar el mismo payload va a fallar igual.

El problema es el 4xx. La cola de subida es **FIFO**: un item trabado bloquea
todo lo que viene atras. Por eso el conector no podia quedarse reintentando, y
lo que hacia era **descartarlo** con un `console.error`. El cambio desaparecia
sin que nadie se enterara. Peor con una edicion: se veia aplicada un rato y
despues volvia sola al valor viejo al sincronizar. Ya paso con la moneda base y
costo entenderlo.

Esto se vuelve critico con lo que viene. Fase 3 trae un renombre
(`email -> username`), un reparto de buckets y validaciones nuevas: la
probabilidad de que un cliente viejo genere un payload que el servidor nuevo
rechaza deja de ser teorica.

## Decision

**Un 4xx no se descarta: se guarda en una bandeja local y se muestra.**

### La tabla

`subidas_rechazadas`, **`localOnly`** (ver esquema.ts): vive solo en ese
dispositivo, no sincroniza ni genera entradas en la cola. Tiene sentido — un
rechazo depende del contrato del servidor en ese momento y de ese cliente, no es
un dato que otros dispositivos deban ver.

Guarda el payload original en JSON (`datos`), la tabla, la operacion
(`PUT`/`PATCH`/`DELETE`), el id de la fila, el motivo que dio el servidor y
cuando. El payload completo es lo que permite **reintentar** mas adelante, y es
lo que un futuro sistema de transformaciones (estilo Alembic para la cola)
podria agarrar y adaptar al contrato nuevo. Sin la tabla, ese dato ya no existe
y ninguna migracion posterior lo rescata.

### La cola sigue fluyendo

El item rechazado se registra y el conector sigue con el siguiente. No se traba
la FIFO, que era el motivo original de descartar. La diferencia es que ahora el
descarte es **a la bandeja**, no a la nada.

### Se ve y se decide

El indicador de sincronizacion (Movimientos) muestra en rojo "N no se guardaron"
cuando la bandeja tiene filas, y se toca para ir a resolverlas. `DESIGN.md` ya
prometia mostrar los cambios sin sincronizar; el codigo no lo cumplia.

En la bandeja, cada rechazo se puede **reintentar** o **descartar**, de a uno o
en lote. Descartar es ahora una **decision explicita**, no una perdida
silenciosa — esa es toda la diferencia con el estado anterior.

El reintento es **en linea**: la fila ya la rechazo el servidor una vez, asi que
reintentar es preguntar "¿ya se puede?" (el servidor se arreglo, el dato cambio).
La que entra se borra de la bandeja; la que vuelve a fallar actualiza su motivo.
Sin conexion no se puede reintentar y el boton se apaga; descartar si.

### Multiseleccion

La bandeja permite elegir varios, con el modelo de un explorador de archivos:
click / Ctrl+click (toggle) / Shift+click (rango) en escritorio, toque largo +
toggle en movil. La logica —el ancla del rango, el toggle— vive en
`lib/seleccion`, pura y probada aparte de la interfaz, porque es la parte con
casos de borde.

## Consecuencias

- Ningun cambio del usuario se pierde en silencio. El peor caso es "quedo en la
  bandeja y hay que decidir".
- La bandeja es la **precondicion** del sistema de transformaciones de la cola
  (el "Alembic para local-first"): guarda el payload hasta que exista quien lo
  sepa adaptar.
- `subidas_rechazadas` es `localOnly`: si se reinstala la PWA o se limpia el
  almacenamiento del navegador, la bandeja se pierde. Es aceptable — son
  cambios que ya fallaron y que el usuario todavia no resolvio; el dato "bueno"
  ya esta local y sincronizado o en la cola normal.
- Reintentar en linea no usa la cola de PowerSync: es un `fetch` directo. Si hay
  que volver a encolar para subir offline mas tarde, es una mejora futura; por
  ahora el caso real es "el server se arreglo, reintento ahora".
