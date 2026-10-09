
# Mango - guia de diseno

> Referencia de estilos e interfaz. Su proposito es que las pantallas no
> deriven: que la quinta se vea como la primera, y que la version de escritorio
> y la de telefono se sientan la misma aplicacion.
>
> Se lee junto con `ESPECIFICACION.md`. Aquel define **que** hace el sistema;
> este, **como se ve**.

---

## 1. Principios

**Cargar un gasto tiene que ser rapido.** Es la accion mas repetida de toda la
aplicacion. Si toma mas de tres toques desde abrir la app, el diseno fallo.

**El dinero se lee de un vistazo.** Los montos son el dato principal de casi
toda pantalla: tipografia tabular, alineados a la derecha, jerarquia clara
entre el numero y su etiqueta.

**Nada de decoracion que no informe.** Sin sombras gratuitas, sin degradados
que no separen contenido, sin animacion que no comunique un cambio de estado.

**Lo pendiente se ve.** Las transacciones que esperan resolucion tienen que ser
visibles sin buscarlas, pero sin gritar.

---

## 2. Dos layouts, no uno responsive

Mango tiene **dos arboles de componentes distintos**, no un layout que se
estira. La razon es que los usos son distintos: cargar un gasto es una tarea de
telefono; analizar el ano es una tarea de escritorio.

El punto de corte es **1024 px**. Por debajo se monta el arbol movil, por
encima el de escritorio. No hay estados intermedios: una tablet en horizontal
usa escritorio, en vertical usa movil.

### Que se comparte

Toda la logica: acceso a datos, estado, validaciones, formateo de montos y
fechas, calculos. Vive en hooks y servicios agnosticos de la presentacion.

**Regla**: si un componente importa algo de `lib/` o `hooks/`, esta bien. Si un
componente de layout movil importa algo de layout escritorio, algo se hizo mal.

### Que cambia

| | Movil | Escritorio |
|---|---|---|
| Espacio actual | **Selector** arriba a la izquierda de cada pantalla principal (ver "Selector de espacio", 0026) | El mismo selector, arriba de la barra lateral |
| Navegacion | Barra inferior: **4 destinos fijos**, las cuatro secciones del espacio actual (Inicio, Movimientos, Presupuesto, Estadisticas), y el boton **+** elevado al centro, en cinco columnas iguales. Los grupos se eligen con el selector; Ajustes vive en el header de Inicio (ver 0022 y 0026) | Barra lateral fija con todos los destinos (Ajustes, Estadisticas y Grupos incluidos). Las secciones siguen al espacio; en un grupo se suma **Ajustes del grupo** |
| Lo que no esta en la barra | Panel de **accesos** en Inicio: 4 elegidos y ordenados por la persona + "Más" (ver 0024) | Bloque **Herramientas** en la barra lateral (metas, deudas, recurrentes, plantillas) |
| Ajustes | Solo **configuracion**: cuentas, categorias, medios, etiquetas, cotizaciones, moneda, apariencia, seguridad (0024) | Igual |
| Accion principal | El **+** central de la barra inferior (no hay boton flotante) | Boton "Nuevo movimiento" en la barra superior |
| Alta de movimiento | Pantalla focal (ruta `/nuevo`, entra deslizando desde abajo) | Modal centrado sobre el dashboard (mismo formulario: `FormularioMovimiento`) |
| Lista de movimientos | Agrupada por dia, una tarjeta por grupo (ver 7) | La misma lista, en columna acotada |
| Detalle de movimiento | Pantalla completa | Panel lateral, la lista queda visible (`ConPanel`, ver 7) |
| Graficos | Uno por pantalla, apilados | Grilla de dos o tres por fila |
| Filtros | La busqueda a la vista, el resto en una **hoja inferior** ("Filtros (n)") y los activos como chips que se quitan | Barra de filtros siempre visible |
| Calendario | Mes con totales por dia, toque abre el dia | Mes con los movimientos visibles en cada celda |

### Estructura de carpetas

```
src/
├── layouts/
│   ├── movil/          navegacion y contenedores de pantalla movil
│   └── escritorio/     idem escritorio
├── pantallas/          una carpeta por pantalla, con variante movil y escritorio
├── componentes/        compartidos entre ambos layouts
├── hooks/              logica de datos y estado
└── lib/                formateo, validacion, utilidades
```

---

## 3. Sistema de tokens

shadcn/ui trabaja con variables CSS. Un tema es un conjunto de valores para
esas variables. **No se escriben colores literales en los componentes**: se usa
siempre el token.

### Tokens de color

| Token | Para que |
|---|---|
| `background` | Fondo de la aplicacion |
| `foreground` | Texto principal |
| `card` | Fondo de tarjetas y paneles elevados |
| `card-foreground` | Texto dentro de tarjetas |
| `primary` | Accion principal, elemento activo |
| `primary-foreground` | Texto sobre `primary` |
| `secondary` | Accion secundaria |
| `muted` | Fondos sutiles, filas alternas |
| `muted-foreground` | Texto secundario, etiquetas |
| `accent` | Resaltado al pasar el mouse o con foco |
| `accent-foreground` | Texto sobre `accent` |
| `enlace` | Texto de enlaces y acciones de texto ("Ver todos", "Cargarla") e iconos que dicen un estado (el check de lo elegido). Es un **alias** de `accent-foreground`, no un color nuevo: ese token ya es oscuro sobre claro y claro sobre oscuro en los tres temas (9:1 a 13:1) |
| `border` | Bordes y separadores |
| `input` | Borde de campos de formulario y de los botones `outline`. Minimo **3:1** contra `background` y `card` (WCAG 1.4.11: el borde es lo que delimita el control). En Mango claro es `#A49163`; el `#CFC5AD` de antes daba 1,7:1. Los seis temas/modos estan en 3,0:1 o mas |
| `ring` | Anillo de foco. Minimo **3:1** contra el fondo (WCAG 1.4.11): en Mango claro es `#A87C00`; el `#D9A300` de antes daba 2,2:1 |

**`primary` es de fondo, no de texto.** El amarillo de marca sobre blanco da
**1,7:1**: como texto no se lee. Va de fondo, con `primary-foreground` encima
(el "+", la pastilla del destino activo, el boton principal). Los enlaces van en
`enlace`.

### Tokens propios del dominio

Estos no vienen con shadcn: los agrega Mango porque son especificos de una
aplicacion de finanzas.

| Token | Para que |
|---|---|
| `expense` | Montos que restan |
| `income` | Montos que suman |
| `transfer` | Movimientos entre cuentas propias |
| `pending` | Transacciones que esperan resolucion |
| `rejected` | Transacciones rechazadas por el banco |

**Regla de accesibilidad**: nunca comunicar gasto o ingreso **solo** por color.
Siempre acompanar con signo, icono o posicion. Cerca del 8% de los varones
tiene alguna deficiencia en la percepcion del rojo y el verde.

### Radio y espaciado

| Token | Valor base |
|---|---|
| `radius` | 8 px |

Escala de espaciado, en multiplos de 4: **4, 8, 12, 16, 24, 32, 48, 64**.

No usar valores fuera de esa escala. Si algo necesita 13 px, casi siempre es
que se eligio mal el contenedor. Al pasar el codigo a la escala, lo que estaba
afuera se llevo asi: 2 y 6 px a 4 y 8 (separaciones minimas), 10 a 12 (icono y
texto en una fila), 20 a 16 en tarjetas y formularios (con 24, en 360 px se
cortaban montos), la sangria de una subcategoria a 24 y el espaciador de carga
a 48.

### Tipografia

**Plus Jakarta Sans** para todo, auto-hospedada (`@fontsource-variable/plus-jakarta-sans`,
importada en `main.tsx`, solo el eje de peso y sin italicas): la app tiene que
funcionar sin conexion, asi que **no se pide a un CDN de fuentes**. El service
worker la precachea (por eso `woff2` esta en `globPatterns` de workbox en
`vite.config.ts`; el patron por defecto de vite-plugin-pwa lo deja afuera).

Es geometrica y algo redondeada: da caracter sin perder legibilidad a 13 px, y
sus cifras tabulares son compactas. La familia declarada es
`Plus Jakarta Sans Variable`, con `system-ui` y `sans-serif` detras como red de
contencion. Un solo archivo cubre todos los pesos de la tabla.

**Geist Mono** (`font-mono`) solo para lo **tecnico**: el teclado de la
calculadora, el numero de dia del calendario y la hora en la fila de
movimiento. Nunca para montos: la monoespaciada le da una celda entera al punto
y a la coma de miles, y `$ 1 . 000 . 000 , 00` se lee peor que con las cifras
tabulares de la familia principal. Por la misma razon se descarto Schibsted
Grotesk como familia, y DM Sans porque no tiene `tabular-nums`.

| Rol | Tamano | Peso |
|---|---|---|
| Monto destacado | 32 px | 600, tabular |
| Monto en lista | 16 px | 500, tabular |
| Titulo de pantalla | 24 px | 600 |
| Titulo de seccion | 18 px | 600 |
| Cuerpo | 15 px | 400 |
| Etiqueta secundaria | 13 px | 400 |

**Los montos usan siempre cifras tabulares** (`font-variant-numeric:
tabular-nums`). Sin eso, una columna de numeros no alinea y se vuelve dificil
de comparar de un vistazo.

**En el codigo**, la escala de Tailwind esta llevada a esta tabla
(`tailwind.config.ts`): `text-xs` es 13, `text-sm` 15, `text-base` 16, `text-lg`
18, `text-2xl` 24 y `text-3xl` 32. Para codigo nuevo hay nombres por rol con los
mismos valores: `text-secundaria`, `text-cuerpo`, `text-monto-lista`,
`text-seccion`, `text-titulo` y `text-destacado`. `cn()` los conoce
(tailwind-merge): sin eso, un tamaño propio junto a un color se perdia.

Excepciones deliberadas, con nombre y no como valores sueltos:

- `text-barra` (12 px): las etiquetas de la barra inferior. Con 13, "Estadisticas"
  no entra en una columna de 360 px.
- `text-celda` (10 px): los montos por dia de las celdas del calendario (solo en
  escritorio).
- Los decimales y el simbolo de `Monto` van a 0,72 y 0,85 em con piso de 11 px
  (0006).
- En el movil, `Segmentado` usa 13 px, como el control segmentado de iOS: con 15,
  "Transferencia" no entraba en un tercio de 360 px. En escritorio, 15.

---

## 4. Modo claro y oscuro

Cada tema define **los dos modos**. No existe un tema que solo funcione en
oscuro.

El modo se resuelve asi:

- `light` — siempre claro
- `dark` — siempre oscuro
- `system` — sigue la preferencia del sistema operativo (**valor por defecto**)

### Reglas del modo oscuro

**No es invertir el claro.** El fondo no es negro puro sino un gris muy oscuro:
el negro absoluto contra texto blanco produce fatiga visual y halo.

**La elevacion se marca con luminosidad, no con sombra.** En claro, una tarjeta
sobre el fondo se distingue por sombra. En oscuro, por ser un poco mas clara
que el fondo.

**Los colores saturados se atenuan.** Un rojo que funciona en claro sobre
blanco vibra desagradablemente en oscuro. Bajar saturacion y subir luminosidad.

**Contraste minimo 4.5:1** para texto normal y 3:1 para texto grande, en ambos
modos. Verificarlo, no estimarlo.

---

## 5. Temas

### Predefinidos

Vienen con la aplicacion, cada uno con su version clara y oscura. Se identifica
con `theme_id`.

El tema `default` es obligatorio y es al que se cae si algo falla.

### Personalizados

**No existen todavia, y la columna que los guardaba se borro.** Habia un
`theme_custom` en `users` que ninguna pantalla escribia ni leia: el editor de
temas esta fuera de fase 1 y guardar el campo antes no adelantaba nada.

Lo que si esta desde el principio es lo que costaria caro agregar despues: los
componentes no declaran colores literales, usan tokens. Cuando el editor se
construya, la forma sera un objeto con **solo los tokens modificados** por modo,
heredando el resto del tema base, asi un tema personalizado sigue siendo valido
si el tema base agrega tokens en una version futura.

### Persistencia

Los tres campos viven en `users`, asi que **viajan con la sincronizacion**: el
tema elegido en el telefono aparece en la computadora.

### Alcance por fase

- **Fase 1**: arquitectura de tokens completa, modo claro y oscuro funcionando,
  campos en el esquema, y dos o tres temas predefinidos. **Sin editor.**
- **Fase 3 o posterior**: pantalla para editar tokens y crear temas propios.

La arquitectura va desde el principio porque agregarla despues significa
reescribir todo el CSS. El editor es una pantalla mas y puede esperar.

---

## 6. Uso de componentes shadcn

Se usa la libreria tal como viene. **No se reescriben sus componentes**: si uno
no encaja, se compone con otros o se crea uno nuevo al lado.

| Situacion | Componente |
|---|---|
| Formulario de alta en escritorio | `Sheet` (panel lateral) |
| Formulario de alta en movil | Ruta a pantalla completa |
| Confirmacion destructiva | `AlertDialog` |
| Elegir cuenta, categoria, medio de pago | `Select` con busqueda si hay mas de 10 opciones |
| Filtros en movil | `Drawer` (hoja inferior) |
| Lista de movimientos en escritorio | `Table` |
| Lista de movimientos en movil | `Card` apiladas |
| Aviso de pendientes | `Badge` con contador en la navegacion |
| Carga en curso | `Skeleton`, nunca un spinner centrado |

**Sobre los skeletons**: se usan porque preservan la forma de la pantalla y
evitan el salto de contenido. Un spinner no dice nada sobre lo que va a
aparecer.

---

## 7. Patrones especificos del dominio

### Mostrar montos

```
Gasto        -$ 2.302,72     token expense, signo menos
Ingreso      +$ 150.000,00   token income, signo mas
Transferencia $ 50.000,00    token transfer, sin signo
```

Siempre con separador de miles. La cantidad de decimales **la decide la
moneda**, no el codigo: dos en ARS o USD, cero en JPY o CLP. De eso se ocupa
`Intl` (ver abajo).

### Como se muestra la moneda

Tres reglas, para que el codigo de moneda no sea intrusivo:

**En la moneda base no se muestra el codigo.** `$ 2.302,72` alcanza. El codigo o
el simbolo largo aparece solo cuando la moneda **no** es la base: `US$ 45,00`.
Esta sola regla saca casi todo el ruido, porque casi todo esta en la base.

**El simbolo va atenuado**, `muted-foreground` y un punto mas chico que el
numero: el ojo tiene que leer el numero primero. **El signo no se atenua**: es
lo que comunica gasto o ingreso cuando el color no se percibe.

**En una lista, el simbolo va en columna aparte de ancho fijo.** `$`, `US$` y
`R$` no miden lo mismo; si comparten caja con el numero, la columna de montos
queda dentada. De eso se ocupa `<Monto variante="lista">`; el monto que no
comparte columna con otros usa `variante="suelto"`.

**El simbolo lo resuelve `Intl.NumberFormat`, nunca una tabla propia.** Una
tabla de simbolos se desactualiza y no sabe la posicion ni los separadores de
cada locale. La moneda base se pide con `currencyDisplay: "narrowSymbol"` (su
simbolo corto) y las demas con `"symbol"`, que en `es-AR` convierte USD en
`US$`, la convencion local para distinguirlo del peso. Si las dos monedas
comparten simbolo igual (base USD y la otra ARS: las dos usan `$`), se cae al
codigo ISO.

Los codigos son **ISO 4217, tres letras** (ARS, USD, EUR, BRL). Los de dos
letras son codigos de pais y no coinciden.

**Los montos no se abrevian nunca** (decision 0006): no hay `$ 1,2 M` ni
`$ 183 k` en ninguna pantalla, y redondear tampoco vale —sacar los centavos es
la misma perdida con otra cara. Cuando un monto no entra, **se cambia el layout,
no el numero**:

- **Bajar un punto de tamano**: las tarjetas de cuenta usan
  `text-base sm:text-lg`.
- **Pasar de columnas a filas**: los tres datos del mes en Inicio son tres filas
  de una tarjeta en movil (un monto completo no entra en un tercio de 390 px) y
  tres tarjetas en fila en escritorio.
- **Mover el numero al detalle y comunicar la magnitud con un grafico**: el neto
  por dia del calendario es una barra proporcional al dia mas movido del mes en
  movil, con flecha para el signo (nunca solo color), y el numero completo en
  escritorio, donde la celda es ancha. El monto exacto vive en el `title` y en
  la lista al tocar el dia.

**Los decimales van mas chicos que el numero** (`0.72em`), con el **separador
pegado a ellos**: `$ 2.302` + `,72`. Los centavos casi nunca deciden algo y en
un tamano solo compiten con los miles; achicarlos ordena la lectura sin ocultar
nada. La coma no se deja en el numero grande porque queda colgando, y no se
saca porque sin separador `2.302` + `72` se puede leer `230272`.

Todo esto vive en un solo componente, **`<Monto>`**, que ademas resuelve la
alineacion (`variante="lista"` para columnas, `"suelto"` para el resto) y la
accesibilidad: el numero queda partido en varios `<span>`, asi que el
contenedor lleva el monto completo en `aria-label` y las piezas van
`aria-hidden` para que el lector de pantalla anuncie **un** numero.

No se aplica dentro de una oracion, en un campo de entrada o su eco, ni en
etiquetas de `text-xs` o menos (incluidos los tooltips de los graficos): ahi va
el formateo plano. El detalle esta en la decision 0006.

**Una cotizacion no es un monto.** Se escribe como frase, `1 USD = 1.734,9747
ARS`, con separador decimal local y hasta cuatro decimales (seis si es menor a
1, si no el numero no dice nada). Los diez decimales de la columna son ruido en
pantalla: el dato exacto es el monto debitado, la cotizacion es derivada. El
formateo esta en `cotizacionLegible` (`lib/conversion.ts`); lo que se guarda es
el string completo, no lo que se muestra.

### Informes en una moneda

Un informe **nunca mezcla monedas** (ver ESPECIFICACION 3.6.1). El patron es
siempre el mismo:

- El **selector de moneda va a nivel de pantalla**, no por cuadro: `Segmentado`
  al lado del titulo, con las monedas que **tienen datos** y la base primero.
  Con una sola moneda el control no se dibuja: seria ruido.
- Debajo, una linea que dice en que moneda se esta leyendo. Un informe que
  filtra sin decirlo se confunde con un informe que suma mal.
- Donde no hay selector (los tres datos del mes en Inicio), se usa la moneda
  base y **se avisa que hay movimientos afuera**, con salida a la pantalla que
  si los muestra. Ni sumarlos ni esconderlos.
- El **movimiento individual nunca se convierte**: va siempre en su moneda.

**El presupuesto usa el mismo control, con una restriccion**: ofrece solo las
monedas que tienen **cuentas presupuestables**, porque no se puede repartir
plata que no entra al presupuesto. No es un informe —es un compromiso— y por eso
ahi nunca se convierte nada (ver 0005).

### Tarjeta de resumen

Inicio abre con **una** tarjeta que junta las dos escalas de la misma pregunta:
el **patrimonio** arriba (cuanto tengo) y el **movimiento del mes** abajo
(ingresos, egresos, resultado), separados por una linea de 1 px. Antes eran dos
bloques sueltos y obligaban a leer dos veces.

**Una tarjeta con una linea, no tarjetas anidadas.** Anidar suma peso visual sin
agregar informacion; la linea ya dice "esto es otra cosa dentro del mismo tema".

Lleva dos controles y ninguno se repite en el titulo (que dice solo "Resumen"):

- **Global / Por moneda**, chips: en Global todo se lleva a la moneda elegida;
  en Por moneda se muestra **solo lo que ya esta** en esa moneda, sin convertir.
- **Selector de moneda** en los dos modos, con la regla de 0007 (chips hasta
  dos, desplegable de tres en adelante). Reemplaza a la lista apilada de saldos:
  en vez de ver todas las monedas juntas, se cambia de moneda.

**Todo se convierte con la misma cotizacion, la ultima** (ver 0005). La tarjeta
es una foto del ahora, y usar dos cotizaciones distintas en el mismo bloque
mezclaria dos valuaciones. La cotizacion del momento de cada movimiento es para
los informes historicos.

**El pie dice el dato, no lo explica**: `Cotizacion del 07/09/2026`, y nada mas.
Que la conversion use la ultima cotizacion es una regla del producto; repetirla
en cada pantalla ensucia la vista sin agregar nada. Un pie de tarjeta es una
linea corta, no una aclaracion.

Lo que no se pudo convertir queda **afuera del total** y se informa con salida a
cargar la cotizacion: un total con una conversion inventada es peor que un total
incompleto.

**Al pie, "Ver estadisticas".** En el telefono, Estadisticas no esta en la barra
(0022), y esta tarjeta es la pregunta de la que Estadisticas es el detalle. Es un
enlace de ancho completo y 44 px de alto, separado por la misma linea de 1 px.
**No es la tarjeta entera**: tiene controles adentro, y un enlace no puede
contener botones.

### Transacciones pendientes

Se distinguen con el token `pending` y un icono, **no solo por color**. En la
lista aparecen intercaladas cronologicamente, no en una seccion aparte: son
parte de la historia real, solo que incompletas.

El contador de pendientes va en la navegacion, siempre visible.

### Sugerencias de categoria

Cuando una transaccion trae `suggested_category_id`, la interfaz muestra la
categoria sugerida **visiblemente marcada como sugerencia**, con las tres
acciones disponibles: aceptar, corregir, descartar.

Nunca presentar una sugerencia como si fuera un dato confirmado.

### Estado sin conexion

Cuando no hay conexion con el servidor, un indicador discreto y permanente lo
informa. **La aplicacion sigue funcionando con normalidad**: no se bloquean
acciones ni se muestran errores. Si hay cambios sin sincronizar, se indica
cuantos.

**La excepcion son las pocas acciones que el servidor tiene que hacer** (exportar
el CSV, cambiar la moneda base, refrescar cotizaciones, generar recurrentes; ver
ESPECIFICACION 3.11). Esas apagan su boton y dicen por que **antes** de que la
persona acepte, en vez de fallar despues. No contradice la regla: lo que se
escribe local nunca se bloquea.

Que hay conexion se pregunta con **`useConexion()`**, no con `status.connected`
de PowerSync a secas. Esta medido: cortando la red, `navigator.onLine` pasa a
false en 2 segundos y `status.connected` seguia diciendo que si a los 45, porque
el socket no se entera hasta que intenta hablar. El hook combina las dos. Aun
asi, habilitado es una prediccion —puede haber red y estar caido el servidor—,
asi que el fallo del pedido se maneja igual.

### Lista de movimientos

**Agrupada por dia.** Cada dia es un grupo con encabezado propio (texto chico,
`muted-foreground`) y una **tarjeta** (`ListaInset`) con sus filas. El encabezado
dice `Hoy`, `Ayer` o la fecha (`02/09/2026`).

**Las fechas van siempre como dd/mm/aaaa** (`formatearFechaCorta`), en toda la
app y en los avisos: nada de "2 de septiembre", "12 oct" ni la fecha ISO. Un mes
o un año no son fechas ("Septiembre de 2026"). Las unicas excepciones son por
espacio: el eje de un grafico va como dd/mm, y una repeticion anual dice "el
10/10".

Cada fila tiene tres zonas:

1. **Avatar**: cuadrado redondeado con fondo `muted` y el icono del tipo de
   movimiento (gasto, ingreso, transferencia) pintado con su token de color.
2. **Identidad**: titulo en negrita (comercio; si no hay, la categoria) y
   subtitulo `muted` con categoria, cuenta y `pendiente` si aplica, separados
   por `·`.
3. **Importe y hora**, alineados a la derecha y apilados: el monto con su token
   de color y signo, y debajo la hora en `muted`.

Es la **misma lista en movil y escritorio** (solo cambia el ancho): mantener una
sola presentacion evita dos verdades sobre el mismo dato.

### Elegir una opcion: chips, lista o desplegable

Tres controles, y cual va depende de **que** se elige, no de cuantos hay:

- **Hasta 4 opciones fijas de una palabra** (Gasto/Ingreso/Transferencia,
  Dia/Semana/Mes/Año): `Segmentado`. Se ven todas sin abrir nada.
- **Pocas opciones fijas que son frases** ("Pasa al lunes", "Todos los meses, el
  día 10"): **`OpcionesRadio`**, radios nativos en una lista agrupada. Es tambien
  el que va cuando **no tiene que haber nada elegido de entrada**: `Segmentado`
  siempre pinta una opcion, y hay elecciones que tiene que hacer la persona (que
  pasa si un vencimiento cae en fin de semana, 0030).
- **Entidades** —cuentas, categorias, medios, etiquetas, monedas, plantillas—:
  **`SelectorEntidad`**, una lista en una `Hoja`. Las creas vos, la lista crece, y
  cada opcion lleva mas que un nombre: la cuenta su moneda, la categoria su icono
  y su jerarquia. El `<select>` nativo no puede dibujar nada de eso y terminabas
  simulandolo con texto ("Padre › Hija").
- **El resto**: `<select>` nativo. Quedan los filtros, donde se cambia rapido y
  seguido, y abrir un panel por cada uno seria peor.

**El desplegable de un `<select>` no se puede estilar**: lo dibuja el sistema
operativo. Existe `appearance: base-select` para eso, pero todavia no funciona en
varios navegadores muy usados. En el telefono no importa —el nativo abre la rueda
de iOS o el dialogo de Android, que se ven bien—; en escritorio desentona con
todo lo demas. Por eso las listas largas las dibujamos nosotros.

El disparador de `SelectorEntidad` usa **los mismos tokens que `ui/select`**: en
un formulario tiene que verse como un campo mas. Lo unico distinto es la flecha,
y a proposito: `›` abre un panel, `▾` despliega en el lugar.

### Presentacion modal: `Hoja`

Un unico componente decide la presentacion segun el layout (nunca se copia y
pega una variante):

- **Movil**: hoja inferior (bottom sheet) con manija, esquinas superiores
  redondeadas, fondo oscurecido y cierre arrastrando hacia abajo.
- **Escritorio**: modal centrado con fondo oscurecido, cierre con `Esc` o click
  afuera.

Se usa para **todos** los formularios de alta/edicion y para el alta de
movimiento en escritorio.

### Listas agrupadas: `ListaInset` / `FilaInset`

Grupo redondeado con borde, fondo `card` y separadores internos de una linea.
Es la presentacion por defecto de cualquier lista de gestion (cuentas,
categorias, medios) y de los grupos de movimientos.

**Las archivadas van en una seccion aparte, al final**, con su propio
encabezado. Nunca mezcladas con las activas.

### Areas tocables

- **Minimo 24 x 24 px** para todo control (WCAG 2.2, 2.5.8). Es el piso, no la
  meta.
- **En el movil, 44 px** para todo control: botones (tambien los de icono y los
  `sm`), campos, desplegables, `Segmentado`, chips de filtro, muestras de color y
  el area del interruptor. En escritorio, con mouse, vuelven a su tamaño (40,
  36, 32). El corte es `lg:`, el mismo que separa los dos layouts: `h-11
  lg:h-10`.
- Si el control se ve chico a proposito (un "Ver todos", un monto que abre su
  edicion), el area se agranda con **padding y margen negativo del mismo
  tamano**: se toca en 44 px y el layout no se mueve.
- Un enlace **dentro de una frase** no necesita el minimo (es la excepcion de la
  norma); uno suelto, si.

### Acciones de fila

Iconos, no texto, y **siempre con `aria-label`**: editar (lapiz), archivar
(caja) / desarchivar (caja con flecha), eliminar (tacho).

El tacho **nunca desaparece y nunca esta deshabilitado**: lo que cambia es lo
que hace. Si la entidad no se usa, pide confirmacion y la borra. Si esta en uso,
abre **"Eliminar y mover a..."** —elegir otra entidad y llevar todo ahi— con el
boton principal en rojo y la lista de lo que se elimina en el camino.

Antes el tacho se pintaba en gris con `aria-disabled` y al tocarlo explicaba que
no se podia borrar. Era un callejon: el usuario queria eliminar algo y la app
solo le decia que no. Ahora hay una salida, asi que el gris seria mentira (ver
ESPECIFICACION 3.3).

### Listas que crecen con el tiempo

Una lista que gana una fila por dia no se muestra completa: **se agrupa por lo
que la identifica y el detalle queda a un toque**. Las cotizaciones ganan una
fila por moneda por dia —~1.400 al año— asi que la pantalla muestra **una fila
por par** con la vigente adelante ("1 USD = 1511,15 ARS · hoy · automática · 6
en total") y el historial de ese par se abre en una `Hoja`.

Las acciones de cada fila (editar, eliminar) viven en el detalle, no en el
resumen: en el resumen ensucian, y ahi la fila sirve para entrar.

### Resumenes con tope

Una lista de resumen nunca crece sin limite: muestra las **mas representativas**
(ordenadas por relevancia, no alfabeticamente) y ofrece una salida explicita al
detalle completo.

| Resumen | Tope | Orden | Salida |
|---|---|---|---|
| Ultimos movimientos (Inicio) | 5 | fecha desc | "Ver todos" -> Movimientos |
| Cuentas (Inicio) | 4, en bloque 2x2 | `sort_order` de Ajustes | "Ver todas (N)" -> Cuentas |
| Gasto por categoria (Estadisticas) | 5 | monto desc | "Ver todas (N)" -> dialogo con la lista completa |
| Gasto por etiqueta (Estadisticas) | 6 | monto desc | "Ver todas (N)" -> dialogo con la lista completa |

El tope se declara como constante con nombre (`MAX_RECIENTES`, `MAX_CUENTAS`,
`MAX_CATEGORIAS`, `MAX_ETIQUETAS`), no como numero suelto en el JSX.

### Desglose de una fila de resumen

Una fila de resumen que **agrega cosas distintas** se puede desplegar para ver
de que esta hecha, con el chevron tenue de "lo expandible se anuncia". Reglas:

- Solo es desplegable si adentro hay **mas de una parte**: con una sola, el
  desglose repite la fila.
- El desglose va en **texto mas chico y tenue**, indentado con un filete a la
  izquierda: es detalle, no un segundo nivel de importancia.
- El porcentaje de cada parte se calcula **sobre la fila padre**, no sobre el
  total de la pantalla: la pregunta que se contesta es "de este gasto, cuanto
  fue cada cosa".
- El gasto cargado directo en la categoria padre (no en una hija) se llama
  **General**. Sin nombre propio nadie entiende de donde sale esa diferencia.

Es el caso de Gasto por categoria en Estadisticas: la fila suma las
subcategorias y el despliegue las separa.

### Barras por entidad con su color propio

Cuando lo comparado son entidades que **el usuario pinto** (etiquetas), la barra
usa el color de la entidad, no un indice de `PALETA`. La barra se mide contra la
**entidad mas grande** de la lista, no contra el total: en informes donde un
movimiento puede contar en varias filas (una etiqueta por proyecto), un
porcentaje del total mentiria. En ese caso va una nota al pie explicando que la
suma puede superar el gasto del periodo y que lo no etiquetado no aparece.

### Variacion contra el periodo anterior

En un gasto **subir es malo**: flecha hacia arriba y token `expense`; bajar,
flecha hacia abajo y token `income`. Siempre con **flecha y signo**, nunca solo
color. Si no habia gasto previo en esa categoria no se inventa un porcentaje:
dice `nuevo`. Si la variacion redondea a cero, `sin cambio`.

### Lo expandible se anuncia

Una tarjeta o fila que se despliega lleva un **chevron tenue** (`muted-foreground`
al 40-50%) que **rota 180 grados al abrir**: arriba a la derecha en una tarjeta,
al final de la linea en una fila. El disparador expone `aria-expanded`. Sin esa
marca, nadie descubre que la tarjeta esconde algo: es el caso de la tarjeta de
sobre en Presupuesto y de la fila de categoria en Estadisticas.

### Confirmaciones: `Confirmar` y `Aviso`

Toda accion que archiva o elimina pide confirmacion (confirmar / cancelar) sobre
`Hoja`. `Confirmar` pinta el boton principal en rojo solo cuando es destructivo;
archivar no es destructivo. `Aviso` es informativo, con una sola accion.

Desarchivar no pide confirmacion: es reversible y no destruye nada.

### Interruptor: `Interruptor`

Encendido/apagado de **una** cosa: pastilla con perilla que se desliza. Es un
`<button role="switch">` con `aria-checked`, no un checkbox nativo —que se ve
distinto en cada sistema y no admite la pastilla—. El deslizamiento es
`motion-safe`; con movimiento reducido queda el cambio de color solo.

Se usa cuando la opcion es binaria y **por fila** (una moneda en automatico o a
mano, el desbloqueo biometrico). Para elegir entre dos alternativas con nombre
va `Segmentado`; para encender algo, el interruptor. La pastilla mide 40×24, pero
el boton que la contiene es de 44×44: el area tocable crece sin agrandar el
dibujo.

### Control segmentado: `Segmentado`

Pista con pildora deslizante para elegir entre pocas opciones excluyentes (tipo
de movimiento, apariencia). El desplazamiento de la pildora es `motion-safe`.

Es un **grupo de radio** (`radiogroup` con `radio` y `aria-checked`), no
pestañas: elige un valor, no muestra un panel. Con el teclado se comporta como
uno nativo: Tab entra a la opcion elegida y las flechas cambian la eleccion. Se
le pasa `etiqueta` para que el grupo tenga nombre ("Tipo de movimiento").

**Si la cantidad de opciones depende de los datos, el control cambia con ella**
(decision 0007): 1 opcion no se dibuja, 2 van en chips, **3 o mas pasan a
desplegable**. Tres codigos de moneda en una fila de 390 px ya obligan a achicar
el texto o a partir la fila, y empeora con cada moneda que agregue el usuario.
Los vocabularios **fijos** (Gasto/Ingreso/Transferencia, Claro/Oscuro/Sistema)
siguen en chips aunque sean tres: su cantidad no crece, y el control esta en la
pantalla mas usada.

La regla vive en un solo componente por rol —`SelectorMoneda`— y las pantallas
le pasan la lista. Si cada pantalla decide, la regla deriva. Cuando el
desplegable no tiene etiqueta visible al lado, lleva `aria-label`: el
`Segmentado` se lee por sus opciones, el `Select` no.

### Estados de carga

Un estado vacio y "todavia no se" **no son lo mismo**, y confundirlos es lo que
producia los saltos al cambiar de pestaña (decision 0008). La regla:

- El corte se hace con **`isLoading`** de la consulta, nunca con
  `data.length === 0`.
- Es **por pantalla**, no por seccion: si cada bloque se destapa cuando llega su
  consulta, la pantalla sube y baja como una escalera.
- **Tres** estados: antes de 120 ms no se dibuja nada; pasado el umbral va el
  **esqueleto**; con datos, el contenido. El umbral evita el parpadeo de un
  esqueleto que vive 40 ms, y el "nada" evita el estado vacio falso.
- El **esqueleto tiene la forma de lo que viene** (`Esqueleto` con el tamano
  real), asi el contenido no empuja nada al llegar. Donde la forma no se sabe,
  `Puntos`.
- **No se opaca ni se bloquea la pantalla anterior**: se navega de inmediato y la
  nueva muestra su estado. Bloquear hace que la app se sienta mas lenta de lo
  que es.
- **Nunca una barra de progreso** para algo indeterminado: un porcentaje
  inventado es una mentira.

### Estados vacios: `Vacio`

Icono tenue, titulo, detalle y **accion** cuando hay una obvia ("Crear cuenta").
Un estado vacio sin salida es un callejon.

### Graficos

- **Series en el tiempo**: area con curva suave y **degradado** que se desvanece
  hacia abajo, sin ejes pesados ni grilla; una serie por token de color.
- **Composicion**: dona (no torta) con el **total en el centro** y leyenda
  aparte con punto de color, monto y porcentaje.
- **Progreso**: anillo con el porcentaje al centro.

Los datos que el usuario lee no se animan al montar (ver 8): toda serie de
recharts va con `isAnimationActive={false}`. Y donde el tamano del grafico es
fijo (las donas) no se usa `ResponsiveContainer`: su ciclo de medicion deja el
area vacia un instante y no aporta nada (decision 0008).

---

### Accesos de Inicio

El panel de Inicio en el movil (0024): **cuatro baldosas y "Más"**, en cinco
columnas iguales, como la barra. Cada baldosa es un icono en un circulo `accent`
(48 px) y el nombre corto debajo, en hasta dos lineas y con guion si una palabra
no entra (`hyphens-auto`, el idioma de la pagina es es-AR). "Más" es un circulo
punteado con un +.

Editar se hace en "Más": **subir / bajar / sacar** y **+ para sumar**, con
botones de icono y su `aria-label` ("Subir Metas de ahorro"). Nada de
arrastrar: con el dedo, en una lista que scrollea, es impreciso, y WCAG 2.5.7 pide
una alternativa igual.

En un **grupo** los accesos son fijos y van en cuatro columnas: Saldar, Poner
plata, Miembros y Categorias (0026). Se ven tambien en escritorio: son acciones,
no destinos que ya esten en la barra lateral.

### Plantillas en el alta

Un solo boton **"Plantillas (n)"** en la fila de la moneda, que abre una `Hoja`
con la lista (buscador con mas de 6) y **"+ Guardar lo cargado como
plantilla"**. No una fila de chips con scroll horizontal: con muchas plantillas
se ven dos y el resto queda oculto (ver "Listas que crecen con el tiempo").

**Son las del espacio donde se carga** (1.6.0): en un grupo, las del grupo; si
no, las personales. Las del grupo se administran en **Ajustes del grupo**
("Plantillas del grupo", con lapiz y tacho por fila). Su formulario no tiene
cuenta ni medio de pago, y lo dice: "Sin cuenta: cada uno paga con la suya al
cargar el gasto". El tipo se muestra como texto y no se elige: una del grupo es
de gasto, y al editar el tipo no cambia (el servidor no lo deja).

### Calculadora

- **Muestra la cuenta**: arriba, a la izquierda, lo acumulado y el operador
  ("100 +"); a la derecha, el resultado parcial ("= 150"). El operador pendiente
  queda marcado (`aria-pressed`, fondo `accent` y anillo).
- **Se guarda lo que se ve**: "100 + 50" sin "=" es 150. Antes se guardaba el
  numero en pantalla (50).
- **Toques rapidos**: las teclas llevan `touch-manipulation`. Sin eso, dos
  toques seguidos en la misma tecla el telefono los toma como doble toque para
  hacer zoom y el segundo se pierde.
- Un monto largo **baja de tamaño** (3xl → 2xl → xl) antes que desbordar. Nunca
  se abrevia (0006).

### Selector de espacio

Un **espacio** es Personal o un grupo, con las mismas pantallas (0026). El
espacio actual se ve siempre en un chip: punto de color (Personal, el amarillo de
marca; un grupo, su color), nombre truncado y chevron, 44 px de alto. Es la
defensa contra cargar algo en el espacio equivocado, asi que **no se esconde**.

- Al tocarlo abre una `Hoja` "Espacios" con Personal y cada grupo (tilde en el
  actual), **Nuevo grupo** y **Administrar**. Cada grupo dice como quedo yo en
  una linea ("Beto te debe $X"), la misma de la tarjeta de grupos del Inicio
  personal.
- El alta dice **"Se carga en ● Casa ▾"** con el mismo chip, y deja cambiar el
  espacio sin salir del formulario.
- Cambiar deja en la **misma seccion** del otro espacio.
- En el movil, el chip encabeza Inicio, Movimientos, Presupuesto y Estadisticas
  (`EncabezadoEspacio`, con las acciones de la pantalla a la derecha). En
  escritorio esta arriba de la barra lateral y esa fila no se muestra.
- Las rutas de los dos espacios usan los mismos nombres de seccion
  (`/movimientos` y `/grupos/<grupo>/movimientos`); se arman con `rutaEspacio`,
  nunca a mano.

### El estado de la pantalla va en la URL

El mes, la vista y los filtros de una lista van en la direccion
(`?mes=2026-09&cuenta=…&q=…`), no en un `useState`. Cambiar un filtro reemplaza
la entrada del historial (`replace`): "volver" sale de la lista, no deshace
filtros de a uno. Un id de la direccion que ya no existe (una cuenta borrada) no
filtra. Entrar a un detalle y volver deja la lista donde estaba, y la
direccion se puede compartir o guardar. El estado efimero (una hoja abierta, un
campo a medio escribir) sigue en el componente.

### Repartir un gasto

El editor de reparto (`EditorSplit`) tiene cuatro modos: **Igual** (con
interruptor por persona), **Exacto**, **%** y **Partes** (0027). Salvo en Exacto,
donde se escribe el monto, debajo de cada nombre se ve lo que le toca. Un gasto
nuevo de un grupo con reparto por defecto arranca en Partes, ya cargado; se
cambia ahi mismo. Al pasar a Partes a mano, cada uno arranca con 1. Quien queda
con 0 partes o 0 % se nombra ("Carla queda afuera de este gasto"): no se deja que
se deduzca de un "$ 0,00".

### Panel de detalle en escritorio

`ConPanel` dibuja la lista y, al costado, el detalle abierto (la ruta hija
`movimientos/:id`). La lista y el panel scrollean cada uno por su lado (el
layout de escritorio tiene alto fijo: scrollea `main`, no el documento). La fila
abierta se marca con fondo y `aria-current`. En el panel, "Volver" es
**Cerrar** (X), y guardar o borrar lo cierra; la lista queda con su mes y sus
filtros, que van en la URL. Pasar de una fila a otra reemplaza la entrada del
historial en vez de apilarla.

### Dos nombres en una linea

"Beto → Vos" va en **una sola linea que se corta al final** (`DeA`), no como dos
nombres que se truncan cada uno: el navegador los achicaba en proporcion y un
nombre corto ("Vos") terminaba en "V…".

### Un monto no se parte

`Monto` no se corta en dos lineas (`whitespace-nowrap`): en una columna angosta
el "$" quedaba solo arriba del numero. Si no entra, se le da mas lugar a la
columna.

### Categorias del sistema

Las crea la app y las usa por su cuenta (hoy, "Reintegros de grupo", con la que
llega cada cobro de un grupo). En la lista de Categorias, en lugar de archivar y
borrar llevan un **"Del sistema"** chico con un candado: se pueden renombrar o
cambiarles el icono, nada mas. Un indicador discreto, no una etiqueta que pese.

### Reintegros aparte de los ingresos

En Estadisticas y en la tarjeta de Resumen, lo que vuelve de un grupo va en su
propia linea ("Reintegros de grupo" / "Reintegros"), entre Ingresos y Egresos,
**solo si hubo**: en un mes sin cobros seria ruido. El Resultado los incluye.

### Hover solo con mouse

`future.hoverOnlyWhenSupported` en Tailwind: los `hover:` aplican solo donde hay
un puntero que pasa por encima. En una pantalla tactil el hover queda "pegado"
en lo ultimo que se toco (en la calculadora, la tecla anterior parecia trabada).

### Atajos del icono

Los atajos del manifiesto (0023) salen en el menu del icono de Android (los 3
primeros) y en la lista de saltos de escritorio (hasta 10). iOS no los muestra.

- **Orden por frecuencia**: primero cargar (gasto, ingreso), despues ver lo
  cargado. El orden es la prioridad, porque cada plataforma corta en un numero
  distinto.
- **Nombre que dice la accion**: "Nuevo gasto", no "Gasto". El `short_name` tiene
  que entrar en el menu del launcher (12 caracteres como maximo).
- **Icono: circulo lleno con el color del token del tema claro** y el glifo lucide
  de la app al 50%. Los de un tipo de movimiento usan su token (`expense`,
  `income`, `transfer`) con el glifo blanco. Los demas usan el amarillo de marca
  con el glifo en `primary-foreground`. El significado esta tambien en el nombre:
  el color solo no dice nada.
- PNG de 96 y 192 px, fuentes SVG en `public/icons/atajos/`.

### Calendario de pagos

Pantalla `/calendario` y tarjeta "Próximos pagos" del Inicio (0030).

- **Cada vencimiento dice su fecha al principio de la segunda linea**, como
  dd/mm/aaaa, y despues cuanto falta o el estado ("12/10/2026 · lunes, en 8
  días"; "06/10/2026 · venció hace 2 días"). Hasta la 1.5.0 la fecha iba en un
  chip ("12 OCT"); salio para que todas las fechas se lean igual. La linea se
  parte si no entra: en el movil comparte la fila con el monto.
- **Vencido**: la linea en `destructive`, y el texto dice "venció": el color
  solo no dice nada.
- **"Avisarme" es una campana en la fila** de la tarjeta (Medios de pago) o de la
  deuda (1.6.0): con un **+** si todavia no avisa ("Avisarme del vencimiento de
  Visa"), sonando si ya tiene recordatorio ("Recordatorio del vencimiento de
  Visa", que lo abre para editarlo). La hoja dice a que sigue ("Sigue a la
  tarjeta Visa: si cambia su día de vencimiento, se corre solo"). En esas filas
  el nombre y el detalle **no se cortan**: con cuatro iconos, a 360 px se
  partian y escondian el dia de vencimiento.
- **El calendario de un grupo** (`/grupos/<grupo>/calendario`, 1.6.0) es la misma
  pantalla con lo del grupo. Bajo el titulo, el punto y el nombre del grupo
  (`EtiquetaGrupo` en variante punto): dice de que espacio es. Se llega por el
  acceso **"Calendario"** del Inicio del grupo y por su tarjeta "Próximos
  pagos". Lo respondido dice **quien** ("12/10/2026 · pagado por Beto"; "por
  vos"), en la fila y en la hoja.
- **El vencimiento de una deuda ofrece "Saldar la deuda"** en lugar de "Cargar el
  pago" y "Ya lo pagué": es un enlace a Deudas con su hoja abierta.
- **Las recurrentes van mezcladas por fecha, como informacion** (1.6.0): el
  icono de repetir antes del nombre, "05/11/2026 · se carga solo" y el monto (un
  ingreso con el +), sin acciones. La fila es un **enlace** a Recurrentes
  (`FilaInset` con `to`), no un boton: lleva a otra pantalla. En el mismo dia van
  primero los recordatorios, que son los que piden algo.
- **Lo ya respondido** (pagado u omitido) se apaga con el **color del texto**
  (`muted-foreground`, que cumple AA), mas un icono (check u omitido). **No con
  opacidad**: el texto secundario a 70% bajaba de 4,5:1.
- **La repeticion se elige como en Samsung Reminder**: atajos que salen de la
  fecha ("Todas las semanas, los sábados") en `OpcionesRadio`, y "Personalizar"
  (cada N + unidad en `Segmentado`, los dias como botones de alternar, el dia del
  mes y el fin). El disparador muestra la regla en palabras, y su nombre
  accesible es la etiqueta **mas** el valor ("Repetir, Todos los meses, el día
  10"), no solo "Repetir".
- **Lo que no aplica no se pregunta**: "Si cae sábado o domingo" aparece solo si
  la regla puede caer en uno, sin opcion elegida, y no deja guardar sin
  responder.
- **Las acciones de un vencimiento van en una `Hoja`**. La principal es "Cargar
  el pago"; despues vienen "Ya lo pagué", "Más tarde" y "Omitir". Lo respondido
  ofrece "Deshacer".
- **"Más tarde" dice a que hora queda cada atajo** ("En 3 horas · hoy a las
  17:09"), en una lista donde la fila entera es el boton, y tambien deja elegir
  fecha y hora. A cualquier hora, como los avisos: desde la 1.5.1 no hay franja
  de noche. Lo pospuesto se ve en la fila ("12/10/2026 · pospuesto hasta hoy a
  las 15:08") y en la hoja, con "Quitar".

### Avisos del sistema (push)

Lo que aparece en la barra del telefono con la app cerrada (0029):

- **Dice a que pertenece**: el titulo empieza con el grupo, "Casa · Te
  registraron un pago". Un aviso que no es de un grupo va sin prefijo.
- **Logo con fondo transparente**: `icon` es `mango-512.png`; `badge`, el
  monocromo `mango-mono-96.png`, que Android pinta en la barra de estado (un
  logo con fondo ahi seria un cuadrado).
- **Uno por origen**: el `tag` es tipo + link, asi que uno nuevo del mismo origen
  reemplaza al anterior en vez de apilarse.
- **Tocarlo lleva a su pantalla**, sin recargar si la app ya estaba abierta.

En **Ajustes › Notificaciones** se prende por dispositivo, con un `Interruptor` y
un texto que dice el estado. Mientras se activa o se manda la prueba, el texto o
el boton dicen que esta pasando ("Activando los avisos…", "Enviando…"): puede
tardar varios segundos.

## 8. Animacion

Se usa para comunicar cambios de estado, no para decorar.

| Uso | Duracion |
|---|---|
| Aparicion de panel o modal | 200 ms |
| Cambio entre pantallas | 250 ms |
| Realimentacion a un toque | 100 ms |
| Aparicion de elemento en lista | 150 ms |
| Espera indeterminada (`latido`) | 1200 ms, en bucle |

El `latido` es **el unico bucle de la aplicacion**: no comunica un cambio de
estado sino "seguimos trabajando", asi que va lento y suave para no robar
atencion (ver 0008 y `componentes/ui/cargando.tsx`).

**Respetar `prefers-reduced-motion`.** Si el usuario pidio menos movimiento, las
transiciones se reducen a cambios de opacidad o se eliminan.

Nada de animacion en la carga de datos que se repita muchas veces: en una lista
de doscientos movimientos, animar cada fila marea.

---

## 9. Lo que no se hace

- Colores literales en componentes. Siempre tokens.
- Texto en `primary` sobre fondo claro: en Mango da 1,7:1. Los enlaces van en
  `enlace`.
- El color de una entidad (grupo, etiqueta) en el **texto**: no garantiza
  contraste. Va en el punto o en el tinte del fondo, y el nombre en
  `foreground`.
- Un checkbox nativo para una opcion binaria por fila: va `Interruptor`.
- `aria-label` en un `<span>` sin rol: esta prohibido y algunos lectores lo
  ignoran. El texto para lectores va en un `sr-only`.
- Sumar un quinto destino a la barra movil (0022): es reemplazar uno.
- Una fila de chips con scroll horizontal para algo que crece (plantillas): va
  un boton que abre una `Hoja` con la lista.
- Un "Volver" con destino fijo en una pantalla que se abre desde varios lugares:
  `useVolver(respaldo)` vuelve a donde se vino.
- Un campo que desaparece cuando no hay opciones (el selector de etiquetas sin
  etiquetas): se muestra igual y permite crear la primera.
- Valores de espaciado fuera de la escala de 4.
- Comunicar informacion solo por color.
- Un layout responsive que estire el movil hasta escritorio.
- Reescribir componentes de shadcn en vez de componerlos.
- Spinners centrados donde corresponde un skeleton.
- Animar por animar.