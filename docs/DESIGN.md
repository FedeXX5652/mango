
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
| Navegacion | Barra inferior, 5 destinos | Barra lateral fija, todos los destinos |
| Accion principal | Boton flotante abajo a la derecha | Boton en la barra superior |
| Alta de movimiento | Pantalla completa | Panel lateral derecho |
| Lista de movimientos | Tarjetas apiladas, una columna | Tabla densa con columnas ordenables |
| Detalle de movimiento | Pantalla completa | Panel lateral, la lista queda visible |
| Graficos | Uno por pantalla, apilados | Grilla de dos o tres por fila |
| Filtros | Hoja inferior desplegable | Barra de filtros siempre visible |
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
| `border` | Bordes y separadores |
| `input` | Borde de campos de formulario |
| `ring` | Anillo de foco |

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
que se eligio mal el contenedor.

### Tipografia

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

El usuario puede sobreescribir tokens puntuales. Se guarda en `theme_custom`
como un objeto con solo los tokens modificados:

```json
{
  "light": { "primary": "#0f766e" },
  "dark":  { "primary": "#2dd4bf", "background": "#0c0f0e" }
}
```

Lo que no este ahi se hereda del tema base. Asi un tema personalizado sigue
siendo valido si el tema base agrega tokens nuevos en una version futura.

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

Siempre con separador de miles y dos decimales. El simbolo de moneda va antes
del signo solo si la moneda no es la base del usuario; si es la base, se puede
omitir en listas densas.

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

---

## 8. Animacion

Se usa para comunicar cambios de estado, no para decorar.

| Uso | Duracion |
|---|---|
| Aparicion de panel o modal | 200 ms |
| Cambio entre pantallas | 250 ms |
| Realimentacion a un toque | 100 ms |
| Aparicion de elemento en lista | 150 ms |

**Respetar `prefers-reduced-motion`.** Si el usuario pidio menos movimiento, las
transiciones se reducen a cambios de opacidad o se eliminan.

Nada de animacion en la carga de datos que se repita muchas veces: en una lista
de doscientos movimientos, animar cada fila marea.

---

## 9. Lo que no se hace

- Colores literales en componentes. Siempre tokens.
- Valores de espaciado fuera de la escala de 4.
- Comunicar informacion solo por color.
- Un layout responsive que estire el movil hasta escritorio.
- Reescribir componentes de shadcn en vez de componerlos.
- Spinners centrados donde corresponde un skeleton.
- Animar por animar.