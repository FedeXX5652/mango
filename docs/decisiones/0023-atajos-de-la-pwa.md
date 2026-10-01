# 0023 - Atajos del icono de la PWA

Estado: aceptada
Fecha: 2026-09-30

## Contexto

Se pidió poder abrir la app directo en una acción desde el ícono: cargar un gasto
o un ingreso, ver los movimientos, las estadísticas, los grupos y, si se puede,
un grupo en particular.

El manifiesto de una PWA tiene para eso el campo `shortcuts`. Lo que hace cada
plataforma (verificado para esta decisión):

| Plataforma | Qué muestra |
|---|---|
| Android (Chrome) | Menú al **mantener apretado** el ícono. Solo los **3 primeros** atajos |
| Windows / escritorio (Chrome, Edge) | Lista de saltos del ícono, **hasta 10** |
| iOS / iPadOS (Safari) | **Nada**: ignora `shortcuts`, también en iOS 26 |

Además:

- El manifiesto es un **archivo estático**. Se arma al compilar y el navegador lo
  pide **sin la sesión**: el token vive en `localStorage` y el pedido del
  manifiesto no lo lleva. No puede listar los grupos de cada persona.
- La web no tiene una API para atajos dinámicos (como el `ShortcutManager` de
  Android nativo).
- Los atajos se actualizan cuando el navegador vuelve a leer el manifiesto (como
  mucho una vez por día). Un cambio no llega al instante a una app ya instalada.

## Opciones evaluadas (para "un grupo en particular")

1. **Un atajo por grupo, en un manifiesto por usuario** servido por el backend:
   el manifiesto se pide sin sesión, y además rompería la imagen sin host
   horneado de 0020. Descartada.
2. **Un grupo "favorito"** elegido en Ajustes: suma una preferencia y pantalla
   para algo que casi siempre es "el que abrí la última vez".
3. **"Último grupo"**: una URL fija (`/grupos/ultimo`) que se resuelve en el
   dispositivo.

## Decision

Siete atajos, **en orden de prioridad** (Android corta en el tercero):

| # | Atajo | Corto | URL |
|---|---|---|---|
| 1 | Nuevo gasto | Gasto | `/nuevo?tipo=gasto` |
| 2 | Nuevo ingreso | Ingreso | `/nuevo?tipo=ingreso` |
| 3 | Movimientos | Movimientos | `/movimientos` |
| 4 | Estadísticas | Estadísticas | `/estadisticas` |
| 5 | Último grupo | Grupo | `/grupos/ultimo` |
| 6 | Transferencia | Transferir | `/nuevo?tipo=transferencia` |
| 7 | Presupuesto | Presupuesto | `/presupuesto` |

- **Los tres de Android son cargar y ver lo cargado**, lo que más se hace. Cargar
  un gasto queda en una pulsación larga y un toque, con el tipo ya elegido
  (DESIGN.md 1: tres toques como máximo).
- **`/nuevo?tipo=`** abre el alta con el tipo elegido. El valor va en castellano,
  como las rutas. Si no viene o es desconocido, abre en Gasto, sin error.
- **"Último grupo"** es la opción 3. Va al último grupo abierto **en ese
  dispositivo**, si todavía es uno de mis grupos. Si no, va al único grupo que
  tengo. Si tengo varios o ninguno, va a la lista. Se guarda en `localStorage`:
  es una comodidad del dispositivo, no una preferencia del usuario.
- **Íconos**: uno por atajo, en PNG de 96 y 192 px, dentro de un círculo con el
  color del token del tema claro. Rojo, verde y azul (gasto, ingreso,
  transferencia) llevan el glifo blanco; los demás, amarillo de marca con glifo
  oscuro. Los glifos son los mismos trazos lucide que usa la app. El significado
  también está en el nombre, no solo en el color. Las fuentes SVG quedan en
  `public/icons/atajos/`.
- **La lista vive en un solo lugar**: `frontend/src/lib/atajos.ts`. La importan el
  manifiesto (`vite.config.ts`) y el alta, y tiene tests: orden de prioridad,
  tope de 10, rutas dentro del scope, tipos válidos, íconos que existen.

### Lo que hizo falta para que cada URL abra donde promete

- **"Cerrar" en el alta**: usaba `navigate(-1)`. Abierta desde un atajo, `/nuevo`
  es la primera pantalla y no hay historial, así que el botón no hacía nada. Sin
  historial propio, ahora va a Inicio.
- **El deep link sobrevive al login y al PIN**: las dos compuertas se dibujan en
  lugar de las rutas, sin tocar la URL. Al entrar o desbloquear, se abre lo que
  pidió el atajo.
- **Sin conexión**: son rutas de la SPA, y el service worker contesta
  `index.html` para cualquier navegación. Los íconos quedan en el precache.

## Por que

El manifiesto estático no puede saber quién es la persona, y un atajo tiene que
funcionar aunque la app esté cerrada y sin red. Una URL fija que se resuelve en
el dispositivo es la única forma de ofrecer "un grupo" respetando las dos cosas.
"El último abierto" cubre el caso común (un hogar con un grupo) sin pantalla
nueva. El favorito queda como evolución si hace falta (ver `docs/BACKLOG.md`).

Lo que se acepta perder: en **iOS no hay atajos**. Las URLs siguen existiendo y
funcionan desde cualquier enlace, pero el menú del ícono no aparece.

## Consecuencias

- Cambiar el orden o sumar un atajo es editar `ATAJOS`. Si se pasa de 10 o el
  ícono no existe, lo frenan los tests.
- Una app ya instalada ve los atajos nuevos cuando el navegador actualiza el
  manifiesto, no en el momento.
- En Android, lo que no entra en los tres primeros existe igual en Windows y
  escritorio.
