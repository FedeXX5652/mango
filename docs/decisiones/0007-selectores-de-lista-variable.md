# 0007 - Selectores de opciones que crecen con los datos: hasta 2 chips, 3 o mas desplegable

- **Fecha**: 2026-09-07
- **Estado**: aceptada

## Contexto

Multimoneda dejo tres selectores de moneda: Estadisticas, Presupuesto y la
tarjeta de Patrimonio. Los tres se hicieron con `Segmentado` (chips) porque con
dos monedas se ven y se usan bien: las opciones estan a la vista y se cambia con
un toque.

Pero **la cantidad de monedas la decide el usuario, no el diseno**. Con tres
codigos ISO en una fila de 390 px ya hay que achicar el texto o partir la fila,
y con cuatro o cinco el control se apila y empuja el contenido. El diseño se
veia bien solo porque el caso de prueba tenia dos monedas.

## Opciones evaluadas

**Chips siempre, con scroll horizontal.** Mantiene la consistencia visual, pero
esconde opciones fuera de pantalla: hay que descubrir que se puede arrastrar, y
la opcion elegida puede quedar invisible.

**Chips siempre, achicando el texto.** Empeora la legibilidad justo donde el
dato importa, y no escala: a la sexta moneda no hay tamano que alcance.

**Desplegable siempre.** Consistente y escalable, pero cuesta un toque extra y
un menu para elegir entre dos cosas, que es el caso normal.

**Cambiar de control segun la cantidad.** Dos formas para el mismo rol. Se
acepta esa inconsistencia porque el criterio es simple y siempre da el control
que corresponde al tamano del problema.

## Decision

Para un selector de **opciones excluyentes cuya cantidad depende de los datos**
del usuario:

| Opciones | Control | Por que |
|---|---|---|
| 1 | **no se dibuja** | No hay nada que elegir; un control de una opcion es ruido |
| 2 | **chips** (`Segmentado`) | Las dos a la vista, un toque, y entran en 390 px |
| 3 o mas | **desplegable** (`Select`) | Los chips ya no entran sin achicar el texto ni apilarse |

El corte esta en dos y no en tres porque tres codigos ISO en una fila de telefono
ya obligan a ceder algo, y a partir de ahi empeora con cada moneda.

Vive en **un solo componente**, `componentes/SelectorMoneda.tsx`, que decide el
control segun `monedas.length`. Las pantallas no eligen: le pasan la lista. Asi
la regla no puede derivar entre Estadisticas, Presupuesto y Patrimonio.

Cuando no hay etiqueta visible al lado, el desplegable lleva
`aria-label="Moneda"`: el `Segmentado` se lee por sus opciones, el `Select` no.

### Lo que NO cambia: los vocabularios fijos

Un selector cuyas opciones estan **decididas en el diseno** y no crecen sigue
siendo chips aunque tenga tres:

- tipo de movimiento (Gasto / Ingreso / Transferencia)
- alcance del informe por etiqueta (Acumulado / el mes)
- vista de patrimonio (Global / Por moneda)
- apariencia (Claro / Oscuro / Sistema)

Ahi la cantidad es conocida y acotada para siempre, el control esta en una
accion principal (cargar un gasto) y un desplegable seria un toque de mas en la
pantalla mas usada de la aplicacion.

## Por que

Se acepta que el mismo rol se dibuje de dos formas distintas segun cuantos
datos haya. A cambio, ninguna pantalla se rompe cuando el usuario agrega su
tercera moneda, que es algo que va a pasar sin que nadie revise el diseno.

La regla tambien sirve de guia para lo que venga: cualquier selector nuevo cuyas
opciones salgan de la base de datos —cuentas, etiquetas, grupos— arranca con el
mismo criterio.

## Consecuencias

- `DESIGN.md` seccion 7 documenta el umbral.
- Un selector nuevo de lista variable se hace con este criterio; si repite la
  logica en vez de encapsularla, va a derivar.
- Si alguna vez hay muchas monedas (mas de ~10), el `Select` nativo tampoco
  alcanza y habra que pasar a un dialogo con buscador, como el de etiquetas.
