# 0014 - Cómo se relacionan lo personal y lo grupal

Estado: aceptada
Fecha: 2026-09-25

## Contexto

Mango lleva las finanzas **globales** de una persona y, opcionalmente, de un
grupo (una pareja, una familia). La pregunta de fondo: cuando algo se comparte,
¿qué es del grupo y qué sigue siendo personal? Y en particular, dos problemas
concretos que aparecieron al usar 3b:

1. **La plata.** Un gasto compartido lo paga alguien, de su cuenta real. Si el
   grupo fuera "otro libro", esa plata se contaría dos veces o se perdería de
   vista.
2. **La taxonomía.** Si Ana categoriza lo compartido como `Casa>Super` y Beto
   como `Hogar>Alacena`, son el mismo gasto y el reporte del grupo los ve
   separados: no agrega. Para un libro grupal, la categorizacion tiene que ser
   compartida.

## Decisión

### Principio: una sola verdad para la plata

**Cada peso vive en exactamente una cuenta, y cada cuenta es de una persona.**
Es la realidad fisica y es el invariante del que depende todo el modelo de
saldos (`amount_account` como fuente de verdad, ver 0005). Compartir **no lo
rompe**: un gasto compartido sigue siendo un gasto real que alguien pagó de su
cuenta.

Consecuencias:

- El **resumen personal** de cada uno = todo lo que **esa persona** pagó: sus
  gastos personales mas su parte de los grupales (la que salió de su bolsillo).
  Ya es asi: los gastos compartidos son del que los cargo (`owner_id`), le llegan
  completos por su stream personal y aparecen en su cuenta. Lo que se oculta es
  **hacia afuera**: los demas miembros no ven de que cuenta ni con que medio se
  pago (3b.2).
- El **grupo es un lente**, no un segundo libro: agrega los gastos compartidos de
  los miembros para ver "cuanto gasto el grupo", sin duplicar plata.
- Los **saldos de un miembro no cambian** por lo que pagaron los otros: esa plata
  no salió de sus cuentas.

### Lo que SÍ tiene ámbito de grupo: la taxonomía

Las **categorias y tags** pueden ser personales o del grupo. El esquema ya lo
soporta: llevan `owner_id` (personal) **y** `group_id` (grupo), los dos
opcionales.

- **Personal** (`owner_id`): para gastos personales.
- **Grupo** (`group_id`): las crea el grupo, las ven todos los miembros, y los
  gastos compartidos se categorizan con estas.

Reglas (decididas):

- **Un gasto compartido usa una categoria del grupo, obligatoriamente.** El
  selector, al elegir "compartir con Casa", muestra las categorias de Casa, no
  las personales. Asi Ana y Beto eligen la misma `Casa>Super` y el reporte del
  grupo agrega bien. Sin mapear personal↔grupo: los dos usan la del grupo.
- **Cualquier miembro** crea y edita las categorias/tags del grupo. Es un hogar,
  no una empresa: nadie queda trabado esperando al dueño.
- **Un grupo nace con un arbol por defecto** (Vivienda/Comida/Transporte…, como
  la siembra personal), listo para usar. Se edita despues.

Esto **ajusta 3b.2**: hoy un gasto compartido referencia la categoria personal
del que lo cargo y se sincroniza "solo la referenciada". Con este modelo usa una
categoria del **grupo**, y las categorias/tags del grupo viajan enteras a los
miembros (son del grupo, todos las ven). No es rehacer: es corregir el ámbito.

Esta es la "ventana bidireccional": el grupo ve los gastos compartidos de cada
uno; y desde lo personal se ve la taxonomia del grupo (tu resumen incluye tus
gastos compartidos, ya categorizados con las categorias del grupo). Mezclas en
tu vista categorias personales y de grupo, y esta bien: son categorias con
nombre. Lo que **no** se mezcla son los libros de plata.

### Cuentas y medios de pago: personales, siempre

No se comparten como regla: la plata vive en la cuenta de una persona. Lo que
existe de verdad es una **cuenta conjunta** (una caja de ahorro a nombre de los
dos), y eso se modela —el dia que haga falta— como una **cuenta propiedad del
grupo** (`group_id`), opt-in. No haciendo compartidas todas las cuentas. Una
cuenta conjunta es una cuenta mas, con dueño = grupo; lo que sale de ahi es del
grupo por naturaleza. Queda anotado, no se construye ahora.

### La liquidación es lo que falta, y es aparte

Lo que hace que "las finanzas del hogar" cierren de verdad no es ver la cuenta
ajena: es la **liquidación** —"pagué la cena, me debes la mitad"—. Eso es splits
y deudas (fase 4/5), y es el verdadero payoff del grupo. La visibilidad
compartida (3b) es el cimiento; la liquidación es el pago. Sin ella, el grupo es
un **libro compartido de gastos**: todos ven todo lo compartido, pero los saldos
de cada uno reflejan solo lo que cada uno puso.

## Consecuencias

- **3b.2 se ajusta**: el selector de categoria de un gasto compartido pasa a
  mostrar las del grupo; el stream de grupo sincroniza las categorias/tags del
  grupo enteras (no "las referenciadas"). La categoria personal deja de viajar.
- **3b.3** (reportes del grupo) se apoya en la taxonomia de grupo: "cuanto gasto
  el grupo en Casa>Super" ya agrega bien porque todos usan la misma categoria.
- Hay que **sembrar el arbol de categorias al crear un grupo**, y permitir crear
  categorias con `group_id` (hoy la creacion es siempre personal).
- Los **splits/deudas** y la **cuenta conjunta** quedan como trabajo futuro, con
  el modelo ya encaminado para recibirlos.

En una frase: **una sola verdad para la plata (cuentas personales); el grupo como
capas encima — taxonomia compartida y visibilidad ahora, reparto despues.**
