# Iconos de Mango

Vectorizados desde la foto de referencia. La silueta coincide en un **99,1%**
con el original rasterizado, con 60 nodos en total.

El amarillo esta corregido al valor de marca `#FDBE02`; el generador habia
devuelto `#F9B804`. Las proporciones y el detalle son los de la foto.

## Colores

| Elemento | Hex |
|---|---|
| Cuerpo | `#FDBE02` |
| Hoja | `#4E7A1E` |
| Tallo | `#4A3118` |

Todas las variantes en color usan exactamente estos tres. La unica excepcion es
el monocromo, que por definicion usa un solo color.

## El tallo

En la foto las tres piezas se tocan: tallo con hoja a 0 px, tallo con cuerpo a
1 px, hoja con cuerpo a 1 px.

El suavizado necesario para vectorizar encoge las formas y las separaba. La
solucion: **el tallo se prolonga 90 px sobre su propio eje hacia el interior de
la fruta, y se dibuja por debajo del cuerpo y la hoja.** La prolongacion queda
tapada y el contacto es geometricamente imposible de romper.

El orden de capas es tallo, cuerpo, hoja.

Verificado: el icono renderiza como **una sola pieza conectada** a 512, 192, 96
y 48 pixeles.

## Archivos

### SVG

| Archivo | Fondo | Uso |
|---|---|---|
| `mango.svg` | transparente | Logo. Interfaz, encabezados, documentacion |
| `mango-any.svg` | blanco opaco | Icono estandar del manifiesto |
| `mango-maskable.svg` | blanco opaco | Android adaptativo |
| `mango-apple.svg` | blanco opaco | `apple-touch-icon` de iOS |
| `mango-mono.svg` | transparente | Bandeja de notificaciones de Android |

### PNG

| Archivo | Para que |
|---|---|
| `favicon-16.png`, `favicon-32.png` | Pestana del navegador |
| `mango-any-48` a `-512` | Manifiesto, atajos, escritorio |
| `mango-maskable-192`, `-512` | Android adaptativo |
| `mango-apple-120/152/167/180` | iPhone, iPad y iPad Pro |
| `mango-mono-24/48/96` | Notificaciones |
| `mango-512`, `mango-1024` | Logo con transparencia |
| `og-1200x630.png` | Vista previa al compartir el enlace |
| `favicon.ico` | Contenedor con 16, 32 y 48 |

## Por que cada variante existe

**El estandar y el enmascarable son archivos distintos.** Declarar el
enmascarable como estandar deja visible el margen del recorte cuando no hay
mascara.

**El enmascarable tiene el contenido al 69,5%.** La especificacion del W3C
define la zona segura como un circulo de 80% de diametro centrado. Sobre 512 px
son 409,6, y la diagonal del mango mide 589 a escala completa.

Verificado: el radio maximo del contenido queda en 180 px contra los 204,8
permitidos, y sobrevive intacto los cuatro recortes de los fabricantes:
cuadrado, squircle, circulo y gota.

**Los iconos de aplicacion son opacos.** Un fondo transparente hace que se
filtre el gris o blanco por defecto del sistema al aplicar la mascara. iOS
compone blanco debajo de cualquier transparencia del `apple-touch-icon`.

**El monocromo usa un solo color para las tres formas**, que se funden en una
silueta unica. Es lo que espera la bandeja de notificaciones de Android, que
tine el icono con su propio color.

## Manifiesto de la PWA

```json
"theme_color": "#FDBE02",
"background_color": "#FFFCF5",
"icons": [
  { "src": "/icons/mango-any-192.png",      "sizes": "192x192", "type": "image/png", "purpose": "any" },
  { "src": "/icons/mango-any-512.png",      "sizes": "512x512", "type": "image/png", "purpose": "any" },
  { "src": "/icons/mango-maskable-192.png", "sizes": "192x192", "type": "image/png", "purpose": "maskable" },
  { "src": "/icons/mango-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
]
```

El de 512 es obligatorio: sin el, Chrome no ofrece instalar la aplicacion.

## En el HTML

```html
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" href="/icons/mango.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/icons/mango-apple-180.png">
<link rel="manifest" href="/manifest.webmanifest">
<meta property="og:image" content="/icons/og-1200x630.png">
```

iOS ignora los iconos del manifiesto y lee unicamente `apple-touch-icon`.

## Verificar despues de publicar

Chrome DevTools, pestana Application, seccion Manifest. Muestra si los iconos
cargan, si el enmascarable respeta la zona segura y si falta algo para que la
aplicacion sea instalable.
