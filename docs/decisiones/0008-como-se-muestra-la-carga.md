# 0008 - Como se muestra la carga: esqueleto propio, nada de afirmar en falso

- **Fecha**: 2026-09-07
- **Estado**: aceptada

## Contexto

Al cambiar de pestaña se veian "artefactos": elementos que aparecian de a poco,
cosas dibujadas raro y saltos de layout.

Se midio la transicion a Estadisticas cuadro por cuadro. No era lentitud de
pintado: era una **escalera de tres pasos**.

| Momento | Que se veia |
|---|---|
| ~80 ms | "Sin gastos este mes" y "$ 0,00" — **datos falsos** |
| ~200 ms | llega la consulta de monedas: aparece el selector y **empuja todo hacia abajo** |
| ~300 ms | llegan los totales: el monto aparece, el anillo de la dona todavia no |
| ~400 ms | recharts termina de dibujar |

Tres causas, ninguna de las cuales es "falta un spinner":

1. **La pantalla afirmaba en falso.** Cada pantalla corre varias consultas y
   cada una resuelve por separado; mientras no resolvieron, `data` es `[]`, y
   `[]` se dibujaba como "no hay datos" en vez de "todavia no se".
2. **Los graficos animaban su entrada.** recharts anima 1,5 s por defecto, lo
   que deja el anillo a medio dibujar. Contradice la regla de no animar datos
   que se leen (DESIGN.md 8).
3. **`ResponsiveContainer` mide antes de dibujar.** Ese ciclo dejaba el area del
   grafico vacia ~100 ms, y no aportaba nada: los radios de las donas son fijos.

## Opciones evaluadas

**Opacar la pantalla actual y mostrar un spinner hasta que la nueva este
lista.** Es la propuesta que aparecio primero. Retiene al usuario en la pantalla
vieja y **hace que navegar se sienta mas lento**, aunque tarde lo mismo. Ademas
tapa una pantalla que ya era correcta para anunciar trabajo sobre otra.

**Un spinner centrado en cada pantalla.** Simple, pero no reserva el lugar de lo
que viene: cuando llegan los datos el layout salta igual, que era la mitad del
problema.

**Traer una libreria de loaders** (`motion` + un componente con 17 variantes).
Da opciones lindas —metaballs, morph, helix— al precio de **~50 KB comprimidos
de dependencia nueva** en una PWA que precachea todo para andar sin conexion, y
de animaciones con filtros SVG (blur + matriz de color) que son caras en un
telefono. Para una espera de 200 ms es mucho, y va contra "nada de decoracion
que no informe" (DESIGN.md 1).

**Esqueletos propios con el vocabulario que ya existe.** Tailwind ya tiene las
keyframes y el gating `motion-safe:` de la seccion 8. Un esqueleto y tres puntos
que laten son ~30 lineas.

## Decision

### 1. Mientras se carga, la pantalla no afirma nada

Se usa `isLoading` de `useQuery` (que pasa a `false` con el **primer**
resultado), no `data.length === 0`. Son **tres** estados, no dos:

| Estado | Que se dibuja |
|---|---|
| Cargando, antes de 120 ms | **nada** |
| Cargando, pasados 120 ms | **esqueleto** con la forma de lo que viene |
| Con datos | el contenido |

El estado intermedio existe porque las consultas van al SQLite local y suelen
volver en decenas de milisegundos: un esqueleto que aparece 40 ms y se va
molesta mas que la espera. Y durante esos 40 ms **tampoco** se dibuja el
contenido, porque ahi es donde aparecia el estado vacio falso.

El corte es **por pantalla, no por seccion**: si cada bloque se destapa cuando
llega su consulta, vuelve la escalera.

### 2. El esqueleto tiene la forma de lo que viene

Bloques del tamano real (una tarjeta de 32, un circulo donde va la dona, filas
de lista). Asi el contenido no empuja nada al llegar. Donde la forma no se sabe,
van **tres puntos que laten** (`Puntos`), que usan `currentColor` y por lo tanto
toman el color del tema sin configurar nada.

No hay barra de progreso: no sabemos cuanto falta, y un porcentaje inventado
seria mentir (misma regla que en 0005 con las cotizaciones).

### 3. Los datos no se animan al entrar

`isAnimationActive={false}` en toda serie de recharts (dona, area, barras). Ya
estaba escrito en DESIGN.md 8 y no se estaba cumpliendo.

### 4. Sin `ResponsiveContainer` donde el tamano es fijo

Las dos donas tienen radios fijos: pasan a `PieChart` con `width`/`height`
explicitos y pintan en el primer frame. Los graficos de evolucion, que si
dependen del ancho, lo conservan.

### 5. No se opaca ni se bloquea la pantalla anterior

Se navega **de inmediato** y la pantalla nueva muestra su propio estado. Es lo
que hace iOS, y evita que la app se sienta mas lenta de lo que es.

## Por que

Se acepta que la primera pintura sea "vacia" durante ~120 ms, que es una
sensacion menos rica que un spinner inmediato. A cambio la aplicacion **nunca
afirma un dato que no tiene**, que en una app de finanzas es lo que importa: ver
"$ 0,00" un instante y despues "$ 182.999" es peor que ver un hueco.

Tambien se acepta no tener el loader mas lindo posible. Un esqueleto propio, sin
dependencia, cubre el 100% del problema medido; la libreria cubria la parte
decorativa, que no era el problema.

## Consecuencias

- Toda pantalla nueva con consultas arranca con el corte de `isLoading`. Si
  dibuja `[]` como "no hay nada", vuelve el defecto.
- Los componentes viven en `componentes/ui/cargando.tsx`: `Puntos`, `Esqueleto`,
  `Cargando` y el hook `useDemora`.
- Si alguna vez hace falta motion de verdad (gestos, transiciones compartidas),
  la conversacion sobre la dependencia se reabre con otro caso de uso; este no
  la justificaba.
