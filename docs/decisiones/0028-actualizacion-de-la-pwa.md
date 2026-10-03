# 0028 - Cómo entra una versión nueva de la app

Estado: aceptada
Fecha: 2026-10-03

## Contexto

En Android, después de un deploy la app tardaba en mostrar la versión nueva:
una o dos aperturas "de cero" (forzar cierre, o que Android la mate). Dos causas
que se sumaban:

1. **Android no cierra la PWA de verdad.** Al "salir y volver", la app retoma la
   misma página sin navegar, y el navegador solo busca un `sw.js` nuevo al
   navegar. Mientras la app viviera en memoria, no se enteraba del deploy.
2. **Aunque lo encontrara, la página abierta seguía con el código viejo.** El
   service worker estaba en `autoUpdate` (se instala y toma el control solo),
   pero nadie recargaba la página: la versión nueva se veía recién en la
   apertura siguiente.

El servidor no era el problema: `sw.js` se sirve sin caché (`nginx.conf`).

## Decision

**La app registra su propio service worker y decide cuándo recargar**
(`lib/actualizacion.ts`; `injectRegister: false` en `vite.config.ts`).

- **Busca versión nueva** al volver a primer plano (`visibilitychange`) y cada 30
  minutos con la app a la vista, además de al abrir.
- **Recarga solo cuando no se pierde nada**: con la app **oculta** o en la
  **pantalla del PIN**. Nunca con la app desbloqueada y a la vista, donde puede
  haber un alta a medio cargar: ahí espera a que la persona salga o a que la app
  se bloquee.
- El worker **se sigue activando solo** (`skipWaiting` y `clientsClaim`). Así un
  teléfono con el código viejo —que no sabe pedirle nada al worker— recibe la
  versión nueva sin trabarse.

**Trampa:** con `injectRegister: false`, vite-plugin-pwa deja de poner
`skipWaiting` y `clientsClaim` aunque `registerType` sea `autoUpdate`, y genera
un worker que **espera un mensaje** para activarse. Ese mensaje no lo manda
nadie: los teléfonos con la versión anterior se habrían quedado con la vieja
para siempre. Por eso van explícitos en `workbox`.

### El bloqueo se mide por el tiempo que pasó

El bloqueo por inactividad (5 minutos, fase 1) dependía de un temporizador, y
volver a la app lo reiniciaba. Con la app en segundo plano Android congela los
temporizadores, así que volver después de horas podía dejarla desbloqueada.
Ahora, al volver, se compara la hora con la de la última actividad: si pasaron 5
minutos, se bloquea.

## Por que

Recargar de golpe con la persona usando la app es peor que tardar un rato: puede
perder un movimiento a medio cargar. Recargar en segundo plano o en el PIN es
invisible, porque al volver la app igual empieza por el PIN o por donde estaba.

## Consecuencias

- Un deploy entra en la apertura siguiente si la app estaba bloqueada, o al salir
  de la app si estaba en uso. Sin esperar a que Android la mate.
- El push de la 1.4.0 suma sus manejadores al mismo worker: el registro ya es
  nuestro, así que no hay nada que cambiar acá.
- Ajusta 0012: la ventana en la que conviven el cliente viejo y el servidor nuevo
  se achica, pero sigue existiendo (un teléfono apagado, por ejemplo). La regla
  de expandir y contraer no cambia.
