# 0006 - Como se muestra un monto: nunca abreviado, con jerarquia interna

- **Fecha**: 2026-09-07
- **Estado**: aceptada

## Contexto

Habia una funcion `formatearCompacto` que mostraba `$ 1,2 M` o `$ 183,2 k` en
los espacios chicos: los tres datos del mes en Inicio, las tarjetas de cuenta y
el neto por dia del calendario. El monto exacto quedaba en el `title`.

En uso se vio el problema: **el numero abreviado no sirve para lo que uno hace
con esta pantalla**. `$ 183,2 k` no dice si gastaste 183.180 o 183.249, y esa
diferencia es justamente lo que se mira en una app de finanzas. Ademas convive
mal con el resto: la misma cifra aparece completa en Estadisticas y abreviada en
Inicio, y parecen dos numeros distintos.

## Opciones evaluadas

**Dejarlo solo donde el ancho es minimo** (tarjetas de cuenta, celdas del
calendario). Mantiene la funcion viva y con ella la inconsistencia: sigue
habiendo pantallas donde el numero esta redondeado sin que se note.

**Sacarlo por completo y adaptar el layout.** Obliga a resolver de verdad los
lugares donde el monto no entra, en vez de esconder el problema abreviando.

## Decision

**Ningun monto se abrevia, en ningun lugar de la aplicacion.** Se elimino
`formatearCompacto` y la opcion `compacto` de `partesMonto`.

Donde el monto no entra, se cambia el layout, no el numero:

- **Los tres datos del mes en Inicio** son tres filas de una tarjeta en movil
  (etiqueta izquierda, monto derecha) y tres tarjetas en fila en escritorio.
- **Las tarjetas de cuenta** bajan un punto de tamano en movil
  (`text-base sm:text-lg`) y muestran el saldo completo.
- **El neto por dia del calendario** no muestra numero en movil: una celda de
  ~45 px no puede mostrar ningun monto completo. Muestra una **barra
  proporcional** al dia mas movido del mes, con flecha arriba/abajo para el
  signo (nunca solo color). El monto exacto esta en el `title` y en la lista al
  tocar el dia. En escritorio la celda es ancha y va el numero completo.

Redondear tampoco es una salida: sacar los centavos es la misma perdida de
informacion con otra cara.

### Los decimales van mas chicos

El monto completo, en un tamano solo, molesta al revés: los centavos pesan
visualmente lo mismo que los miles cuando casi nunca deciden algo. Entonces el
monto se dibuja con **jerarquia interna**, en un unico componente (`<Monto>`):

```
$ 2.302,72      ->   $ (0.85em, atenuado)  2.302 (1em)  ,72 (0.72em)
```

- **El separador decimal viaja con los decimales chicos**, no con el numero
  grande. Con la coma en el numero grande (`$ 2.302,` + `72`) queda colgando y
  se lee como un error de tipeo; sin ningun separador (`2.302` + `72`) el ojo
  puede leer `230272` cuando los dos tamanos son parecidos.
- **El signo no se achica ni se atenua**: es lo que comunica gasto o ingreso
  cuando el color no se percibe.
- Las monedas **sin decimales** (JPY, CLP) no tienen nada que achicar: `Intl` no
  devuelve parte fraccionaria y no se dibuja.
- La alineacion en columna se mantiene porque todos los montos de una misma
  moneda tienen la misma cantidad de decimales, asi que la parte chica mide
  siempre igual.

**Accesibilidad**: el numero queda partido en varios `<span>`, y un lector de
pantalla leeria tres pedazos. Por eso el contenedor lleva el monto completo en
`aria-label` y las piezas van `aria-hidden`: se anuncia **un** numero.

**Donde no se aplica**, a proposito:

- **Dentro de una oracion** ("... · $ 8.000,00 · mensual"): ahi el monto es
  parte del texto y va con el formateo plano.
- **En un campo de entrada** y en su eco (el asignado del sobre, el display de
  la calculadora): lo que se ve es lo que se esta tipeando.
- **En etiquetas muy chicas** (`text-xs` o menos) y en los tooltips de los
  graficos: por debajo de ~9 px el decimal achicado deja de leerse, y recharts
  recibe un string, no marcado.

## Por que

Se acepta perder densidad: hay pantallas con menos numeros a la vista y layouts
que cambian entre movil y escritorio. A cambio, **todo monto que se ve en Mango
es el monto**, sin excepciones que haya que recordar. En una aplicacion de
finanzas la exactitud del numero es el producto.

## Consecuencias

- `DESIGN.md` seccion 7 ya no tiene excepcion de abreviado.
- **`<Monto>` es el unico lugar donde se dibuja un monto con jerarquia.** Un
  monto nuevo en pantalla se agrega usando ese componente; si aparece
  `formatearMonto` suelto en un JSX, o es uno de los casos exceptuados o es un
  descuido.
- Cualquier lugar nuevo donde un monto no entre se resuelve con layout (bajar
  tamano, cambiar de columnas a filas, mover el dato al detalle), nunca
  abreviando.
- Si alguna vez se necesita comunicar magnitud en un espacio minimo, el recurso
  es **grafico** (barra, anillo), no un numero recortado.
