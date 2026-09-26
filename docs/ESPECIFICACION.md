# Mango

**Sistema de finanzas personales y compartidas.**

> Documento de especificacion y fuente de verdad del proyecto.
> Escrito para que alguien sin contexto previo entienda que se construye,
> por que, y con que criterios. Toda sesion de trabajo empieza leyendolo.

---

## 1. Que es esto

Mango es una aplicacion web instalable (PWA) para llevar las finanzas de una persona
y, opcionalmente, de una pareja o grupo familiar. Reemplaza a las apps
comerciales de control de gastos, con tres diferencias centrales:

- **Los datos viven en infraestructura propia**, no en la nube de un tercero.
- **Ingesta automatica** de transacciones desde los correos que envian los
  bancos y las tarjetas.
- **Privacidad selectiva**: cada persona decide, transaccion por transaccion,
  que comparte y que no.

El sistema tiene **dos mitades que se disenan por separado** y se encuentran
en la misma base de datos:

```
   ┌────────────────────────┐      ┌──────────────────────────────┐
   │   SISTEMA MANUAL       │      │   SISTEMA AUTOMATICO         │
   │   (seccion 3)          │      │   (seccion 4)                │
   │                        │      │                              │
   │  Una persona carga,    │      │  n8n lee correos, extrae     │
   │  edita, categoriza     │      │  transacciones y las empuja   │
   │  y presupuesta.        │      │  por API. Sin interfaz.      │
   │                        │      │                              │
   │  Todo dato debe ser    │      │  Puede dejar transacciones    │
   │  valido y completo.    │      │  incompletas, marcadas como   │
   │                        │      │  pendientes.                  │
   └───────────┬────────────┘      └──────────────┬───────────────┘
               │                                   │
               └──────────────┬────────────────────┘
                              ▼
                    ┌──────────────────┐
                    │   API + base     │
                    │   de datos       │
                    └──────────────────┘
```

### La regla que separa las dos mitades

**El sistema manual nunca acepta datos incompletos o inconsistentes.** Si una
persona carga un gasto, la cuenta tiene que existir, la categoria tiene que
existir, y el monto tiene que ser valido. La interfaz no ofrece opciones
invalidas: se elige de listas, no se escribe texto libre que despues haya que
resolver.

**El sistema automatico si puede producir transacciones incompletas**, porque
recibe datos del mundo real que no siempre alcanzan. En ese caso las marca
como pendientes y las deja para que una persona las complete desde el sistema
manual.

Dicho de otra forma: **"pendiente" es un estado que solo puede crear la
ingesta automatica.** Nunca surge de una carga manual.

---

## 2. Por que se construye en vez de usar algo existente

| Herramienta | Por que no alcanza |
|---|---|
| **Actual Budget** | Local-first y solido, pero un archivo de presupuesto es todo-o-nada: ambos miembros ven exactamente lo mismo. No existen transacciones privadas dentro de un presupuesto compartido. |
| **Firefly III** | Contabilidad de partida doble muy completa, pero pensada como los libros de una sola persona. Sin modelo de privacidad entre usuarios. |
| **Honeydue** | Hace exactamente lo que se busca (gastos individuales separados mas seccion compartida), pero es cerrado, vive en la nube de un tercero y se monetiza con los datos. |
| **Money Manager** | Es lo que se usa hoy. Muy bueno para uso individual, pero sin multiusuario, sin ingesta automatica y sin API. |

### Requisitos que ninguna cumple simultaneamente

1. **Privacidad selectiva entre usuarios.**
2. **Ingesta automatica propia**, sin servicios de agregacion bancaria.
3. **Funciona sin conexion**, con sincronizacion posterior.
4. **Datos propios**, en infraestructura del usuario.

---

## 3. Sistema manual: la aplicacion

Lo que se usa todos los dias. Debe ser al menos tan comodo como Money
Manager: si cargar un gasto es incomodo, no se carga.

### 3.1 Principio de validez

Toda entidad que se referencia debe existir previamente. La interfaz trabaja
con selectores, no con texto libre:

- La **cuenta** se elige de las cuentas existentes. Si no existe, se crea
  primero.
- La **categoria** se elige del arbol de categorias. Si no existe, se crea
  primero.
- El **medio de pago** se elige de los medios registrados.

No hay "crear al vuelo escribiendo un nombre". Eso evita cuentas duplicadas
por errores de tipeo y mantiene los reportes coherentes.

### 3.2 Registro de movimientos

Tres tipos, un solo modelo de datos:

- **Gasto**: sale plata de una cuenta
- **Ingreso**: entra plata a una cuenta
- **Transferencia**: se mueve plata entre dos cuentas propias

Campos de un movimiento:

| Campo | Obligatorio | Notas |
|---|---|---|
| Fecha y hora | Si | La hora importa para deduplicar |
| Monto | Si | Entero en centavos |
| Moneda | Si | |
| Cuenta | Si | Debe existir |
| Categoria | Si (gasto/ingreso) | Debe existir |
| Medio de pago | No | |
| Comercio / contraparte | No | Es el **detalle**, no la categoria |
| Notas | No | |

La pantalla de alta es la mas usada del sistema: debe abrirse rapido, tener
calculadora en el campo de monto, y autocompletar el comercio con lo ya
cargado.

### 3.3 Cuentas y medios de pago

Se modelan por separado, y es una distincion central:

- **Cuenta**: donde esta la plata. Caja de ahorro en pesos, cuenta en
  dolares, efectivo, tarjeta de credito.
- **Medio de pago**: con que se paga. La tarjeta de debito terminada en 8027.

Una tarjeta se asocia a **una cuenta por moneda**:

```
tarjeta 8027 + ARS  ->  Caja de ahorro pesos
tarjeta 8027 + USD  ->  Cuenta dolares
tarjeta 8027 + BRL  ->  (sin asociar)
```

Refleja como funciona en la realidad: una tarjeta de debito apunta a la
cuenta local por defecto y a una cuenta internacional para compras en el
exterior. Y es lo que le permite al sistema automatico deducir de que cuenta
salio cada compra importada.

#### Orden elegido por la persona

Cuentas y medios de pago tienen `sort_order`: la persona decide en que orden se
listan (en Ajustes, modo "Ordenar", flechas arriba/abajo). Mover un item
**renumera toda la lista de 0 a n-1**, asi los valores quedan compactos aunque
vinieran todos en 0.

Ese orden **no es del dispositivo, es del usuario**: vive en la tabla y por lo
tanto **se sincroniza** (5.4 y 3.11). El resumen de Inicio muestra las primeras
cuatro cuentas segun ese orden, asi que cambiarlo en la computadora cambia lo
que se ve en el telefono.

Lo unico que queda **local al dispositivo a proposito** es el codigo de acceso
(PIN) y la biometria: nunca salen del dispositivo (5.1 del PIN en DESIGN, y la
decision de fase 1 de no mandarlo al servidor).

#### Archivar es la regla; eliminar es la excepcion

Vale para **cuentas, categorias y medios de pago**: las tres se **archivan**.
Archivar las saca de los selectores pero **conserva la referencia**, asi los
movimientos historicos siguen mostrando de donde salio la plata y con que se
pago. Es reversible.

**Eliminar solo se ofrece si la entidad no esta en uso.** "En uso" significa que
algo la referencia: movimientos, presupuestos (o sus reglas), plantillas,
recurrentes, medios asociados o subcategorias. Si esta en uso, la interfaz no
permite borrarla y explica por que (ver DESIGN.md 7). Si no lo esta —el caso
real: la creaste mal— se elimina con confirmacion.

#### Eliminar y mover: el tercer camino

Archivar sirve cuando la entidad **fue real** y su historia tiene sentido. Pero
a veces no: dos categorias que en realidad eran una, una cuenta cargada por
error, un medio duplicado. Para eso esta **"Eliminar y mover a..."**: se elige
otra entidad, **todo lo que referenciaba a la vieja pasa a la nueva** y la vieja
se elimina. El historial no pierde nada; es como si hubieran estado juntas desde
el principio.

Que se mueve y que no:

| Entidad | Se mueve | Se elimina, y se avisa |
|---|---|---|
| Categoria | movimientos, plantillas, recurrentes y **sus subcategorias** (pasan a colgar del destino) | las asignaciones de presupuesto: el sobre es categoria + moneda + mes y sumarlas a otro cambiaria lo asignado (ver 0005) |
| Cuenta | movimientos (las dos puntas de una transferencia), plantillas, recurrentes | las asociaciones con medios de pago: hay una por medio y moneda, y el destino ya puede tener la suya |
| Medio de pago | movimientos, plantillas, recurrentes | sus cuentas asociadas: cada medio tiene las suyas |

Restricciones del destino, para no corromper datos:

- **Cuenta**: solo otra de la **misma moneda**. Los montos estan en la moneda de
  la cuenta; mover pesos a una cuenta en dolares los convertiria en otra cosa.
- **Categoria**: del mismo `kind` (un gasto no se mueve a una de ingreso) y, si
  la que se elimina tiene subcategorias, solo una **raiz**: el arbol tiene dos
  niveles y colgarlas de una subcategoria haria tres.

Todo se escribe **local y en una sola transaccion** del dispositivo: o se mueve
todo o no se mueve nada (ver 3.11). Mover 300 movimientos genera 300 subidas en
la cola, y esta bien: es una accion rara y hacerla por endpoint la volveria
imposible sin conexion.

Eliminar tampoco es fisico: marca `deleted_at` (regla 3 de CLAUDE.md). El
chequeo de "en uso" corre sobre la base local; las tablas que no se sincronizan
al cliente (por ejemplo `category_rules`, de la ingesta) no se verifican ahi.

### 3.4 Categoria y comercio son cosas distintas

Es la distincion que mas confusion genera, asi que se explicita:

| Concepto | Que responde | Ejemplo |
|---|---|---|
| **Categoria** | A que corresponde el gasto | `Transporte` |
| **Subcategoria** | Detalle de la categoria | `Colectivo` |
| **Comercio** | Donde se hizo el gasto | `SUBE VIAJES - BUSES` |

El comercio es **texto libre y descriptivo**. La categoria es una entidad del
sistema, elegida de una lista.

**El sistema automatico extrae el comercio, nunca la categoria.** El correo
del banco dice donde se gasto, no en que rubro clasificarlo. La clasificacion
la define la persona.

Las categorias tienen dos niveles: principal y subcategoria. Dos niveles
alcanzan; mas profundidad complica la interfaz sin aportar.

Una subcategoria **se puede mover de padre** (o pasar a raiz), con las mismas
reglas que al crearla: el padre debe ser una raiz del mismo `kind`, y una
categoria con subcategorias no puede volverse subcategoria. El `kind`, en
cambio, es inmutable: cambiarlo convertiria en ingresos gastos ya clasificados.

### 3.5 Tabla de asociacion comercio a categoria

Para no clasificar el mismo comercio una y otra vez, existe una tabla que
relaciona un patron de comercio con una categoria y subcategoria:

```
"SUBE"        ->  Transporte / Colectivo
"PEDIDOSYA"   ->  Comida / Delivery
"FARMACIA"    ->  Salud / Medicamentos
```

Esta tabla se puede editar a mano desde la aplicacion, y crece sola cuando la
persona confirma una sugerencia (ver 4.5).

### 3.5.1 Etiquetas: una dimension aparte de la categoria

La categoria y la etiqueta responden preguntas distintas y por eso son campos
distintos:

| Concepto | Que responde | Ejemplo |
|---|---|---|
| **Categoria** | De que TIPO es el gasto | `Comida / Restaurante` |
| **Etiqueta** | A que PROYECTO pertenece | `Viaje 2027` |
| **Comercio** | Donde se hizo | `LA CABRERA` |

Sin etiquetas aparece un conflicto apenas se usan sobres para proyectos: una
comida durante un viaje, si va a `Comida`, deja el sobre del viaje sin consumir;
si va a `Viaje 2027`, arruina el informe de comida. La etiqueta lo resuelve: el
gasto va a `Comida` **con la etiqueta** `Viaje 2027`, y salen los dos informes sin
pisarse. Un gasto puede tener varias etiquetas o ninguna.

El sobre de ahorro del viaje (`Ahorro / Viaje 2027`, con arrastre) es donde se
aparta plata mes a mes; el costo real del viaje sale sumando por etiqueta.

Las tablas `tags` y `transaction_tags` estan en el esquema desde ahora; la
gestion de etiquetas vive en Ajustes, con las mismas reglas que el resto de las
listas (orden alfabetico, archivar como regla, borrar solo si no se uso).

**El informe que las justifica.** En Estadisticas, "Gasto por etiqueta" suma el
gasto confirmado de cada etiqueta. El alcance por defecto es el **acumulado**,
no el mes: un proyecto cruza meses y lo que se quiere saber es cuanto costo el
viaje entero; un selector permite acotarlo al mes que se esta viendo.

Dos advertencias que el informe declara en pantalla, porque cambian como se lee:

1. Un movimiento con varias etiquetas **suma en todas**, asi que el total del
   informe puede superar el gasto del periodo. Por eso no se muestran
   porcentajes sobre el total.
2. El gasto **sin etiquetar** no aparece. La etiqueta es opcional; el informe no
   pretende explicar todo el gasto, cosa que si hace el informe por categoria.

Una etiqueta archivada sigue apareciendo si tiene gasto: el proyecto termino,
pero lo que costo no cambia.

### 3.6 Presupuesto por sobres

Mango presupuesta por **sobres** (envelope / base cero), como Actual o YNAB. Es
**transaction-first en la interfaz** (la pantalla mas usada sigue siendo cargar
un gasto) y **budget-first en el modelo de datos**: por debajo, todo soporta
sobres con arrastre desde el principio.

**Asignar plata a un sobre no mueve plata.** Es la regla que todo lo demas
respeta. Si tenes 300.000 en la cuenta y asignas 50.000 al sobre Viaje, seguis
teniendo 300.000; lo unico que cambio es que el sistema dejo de ofrecerte esos
50.000 para otra cosa. Son dos dimensiones del mismo hecho: las **cuentas** dicen
cuanta plata tenes; los **sobres**, para que esta comprometida. Y siempre cierran:
la suma de las cuentas presupuestables = la suma de los sobres + lo que queda por
asignar.

**Un sobre es una categoria.** No es una entidad nueva: es la vista
presupuestaria de una categoria. Para un mes, cada sobre tiene tres numeros:

- **asignado** — cuanto pusiste ahi este mes
- **gastado** — cuanto se consumio de transacciones de esa categoria
- **saldo** — asignado menos gastado, mas el arrastre del mes anterior

**Un padre es hoja y grupo a la vez, y siempre es un sobre.** Regla de consumo:
*cada movimiento consume del sobre de su categoria exacta, y de ninguno mas.* Un
gasto en `Comida > Delivery` consume del sobre `Delivery`; un gasto en `Comida` a
secas consume del sobre `Comida`. El **encabezado del grupo** suma padre e hijas
pero es **informativo**: no se le asigna plata, no entra en "por asignar" ni en la
suma del invariante. Esto es a proposito y distinto de YNAB/Actual (donde el padre
es solo grupo): asi, agregar una subcategoria a una categoria que ya tiene
movimientos y presupuesto **no la rompe** —sigue siendo un sobre valido y la nueva
nace al lado (ver decision 0004).

**Arrastre (`rollover`, por sobre).** Comida suele ir sin arrastre (cada mes
arranca con su tope). "Viaje 2027" va con arrastre: acumula mes a mes. Por eso un
solo mecanismo cubre **topes de gasto** y **ahorro para objetivos**. (Las "metas"
de ahorro son sobres con arrastre; ver 5.7 / decision 0004.)

**Asignacion recurrente (`budget_rules`).** Un sobre puede fijar "$X todos los
meses": al abrir la app (o al ejecutar los recurrentes) el sistema crea la
asignacion del mes con ese monto **si todavia no hay una** —nunca pisa lo que
asignaste a mano. Es lo que antes intentaba `default_budget`, ahora por el
sistema de recurrentes (3.7). La configuracion vive en la propia tarjeta del
sobre; mientras esta activa, editar el monto del mes actualiza la regla.

**Por asignar.** Es la plata todavia no repartida:
`por_asignar = saldo de cuentas presupuestables - suma de lo asignado`. Un ingreso
suma a "por asignar", no a un sobre: vos decidis como repartirlo.

#### Un presupuesto por moneda

**El sobre es categoria + moneda + mes** (decision 0005). Una misma categoria
puede tener sobre en pesos y en dolares: `Viaje 2027` en pesos para lo local, en
dolares para los pasajes. El arbol de categorias es uno solo, compartido entre
monedas.

Cada moneda tiene su propio "por asignar" y el invariante se cumple **por
moneda**, cada una por separado:

```
por_asignar(moneda) = saldo de cuentas presupuestables EN esa moneda
                      - suma de lo asignado a sobres EN esa moneda
```

**Un movimiento consume del sobre de su categoria exacta, en su moneda.** No hay
conversion en ninguna parte del presupuesto: un sobre es un compromiso concreto
y tiene que ser exacto, no una estimacion que cambia cuando cambia el dolar. Por
eso tampoco se convierte para presupuestar (se evaluo y se descarto en 0005).

**Comprar dolares es una transferencia entre dos cuentas presupuestables**: no
consume ningun sobre, baja "por asignar" en pesos y sube en dolares. Si esa
plata estaba comprometida a sobres, "por asignar" en pesos queda en negativo y
avisa, que es informacion correcta.

La asignacion recurrente tambien es por moneda: un sobre puede tener "$X todos
los meses" en pesos y "US$ Y todos los meses" en dolares, y el sistema crea una
fila por moneda.

**Cuentas dentro y fuera del presupuesto (`off_budget`).** Las cuentas dentro
(caja de ahorro, efectivo, tarjeta de credito) suman a "por asignar". Las de fuera
(inversiones, plazo fijo, terceros) cuentan para el patrimonio pero no para lo
repartible. "Por asignar" no distingue de que cuenta viene la plata; en
consecuencia, **una transferencia entre dos cuentas presupuestables no toca los
sobres**.

**Sobregiros: no se bloquea nada.**

- *Sobre en rojo*: asignaste 40.000 y gastaste 55.000 -> saldo −15.000. Es
  informacion, no error. El negativo arrastra salvo que se cubra.
- *"Por asignar" en negativo*: presupuestaste plata que no tenes. Es el aviso mas
  util: un tope por categoria te dice que te pasaste en comida; los sobres te
  dicen que te pasaste **en total**.

Siempre se avisa con el token `expense` y **nunca solo por color** (signo o icono).

**Tarjeta de credito.** Es una cuenta con saldo negativo, dentro del presupuesto.
El **gasto con tarjeta consume del sobre en el momento** (comprometiste esa plata,
aunque todavia no salio de la cuenta). El **pago del resumen es una transferencia**
banco -> tarjeta, no un gasto; registrarlo como gasto lo contaria dos veces.

**Etiquetas (ver 3.5.1).** El costo total de un proyecto (un viaje) sale por
etiqueta, sin ensuciar los informes por categoria.

### 3.6.1 Informes en una moneda a la vez

Sumar montos de monedas distintas da un numero que no significa nada: "Ingresos
del mes" mostrando `$ 1.000.500` cuando son 1.000.000 de pesos **mas** 500
dolares es un dato falso, no una aproximacion. Y convertir exige cotizaciones,
que son otro problema (ver 3.6.2).

Por eso ningun informe suma monedas distintas **sin convertirlas**:

- **Estadisticas** tiene dos modos, con el mismo selector de moneda: **Global**,
  que lleva todo a la moneda elegida convirtiendo cada movimiento con la
  cotizacion de **su dia**, y **Por moneda**, que muestra solo lo que ya esta en
  esa moneda, sin convertir. Los cuatro cuadros —dona por categoria, ingresos y
  egresos, evolucion, gasto por etiqueta— responden al modo a la vez. Con una
  sola moneda el control no aparece.
- **Los tres datos del mes en Inicio** van en la moneda base. Si el mes tiene
  movimientos en otra moneda, lo avisa y ofrece verlos en Estadisticas: no los
  suma ni los esconde.
- **El neto por dia del calendario** es de una sola moneda, con el pie diciendo
  cual. Los movimientos en otra moneda siguen apareciendo en la lista.

El movimiento individual nunca se convierte: se muestra siempre en su moneda.

**El patrimonio es la excepcion, y a proposito**: ahi la pregunta es "cuanto
vale lo que tengo", que solo se contesta en una moneda. La tarjeta tiene dos
vistas —**Global** (convertido, con selector de moneda y la fecha de la
cotizacion usada) y **Por moneda** (los saldos exactos, sin convertir)— y si
falta una cotizacion ese saldo queda afuera del total, dicho en pantalla.

En el resumen, **los movimientos usan la misma cotizacion que el patrimonio**:
la ultima. La tarjeta dice "cuanto tengo y como vino el mes, en esta moneda,
hoy", como si cambiaras todo ahora.

**En Estadisticas es al reves**: cada movimiento se convierte con la cotizacion
de su fecha, porque "lo gastado en marzo" no puede cambiar porque hoy salto el
dolar. El orden es: si el movimiento ya esta en la moneda pedida se usa tal
cual; si la cuenta debitada esta en esa moneda se usa **el monto debitado**, que
es el que cobro el banco de verdad; si no, la serie de cotizaciones a esa fecha.
Lo que no se puede convertir **queda afuera del total** y se dice al pie, con
salida a cargar la cotizacion (ver 0005).

### 3.6.2 Multimoneda

El modelo completo esta en la decision 0005: un presupuesto por moneda con su
propio "por asignar", patrimonio con cotizacion actual, informes historicos con
la cotizacion del momento de cada movimiento, y el tipo de cambio real anotado
por movimiento (con el monto debitado como fuente de verdad). Adelanta trabajo
que estaba en fase 4.

**Al cargar un gasto en otra moneda** aparece un campo mas: *monto debitado de
la cuenta*, lo que figura en el resumen del banco. De ahi sale la cotizacion,
que se muestra debajo pero no se pide: los dos caminos no dan el mismo numero y
el del resumen es el que cuadra el saldo (ver 0005 punto 5). El campo aparece
solo cuando la moneda del movimiento no es la de la cuenta elegida.

El monto debitado **puede quedar vacio**: la compra en USD esta completa igual y
se guarda `confirmed`, no `pending` (regla 4). Los que les falta se cuentan en
un filtro de la lista de movimientos, "N movimientos sin el monto debitado", que
solo aparece si hay alguno. La exportacion a CSV lleva las dos columnas
(`monto_debitado`, `cotizacion`), vacias cuando no hubo conversion.

**Las cotizaciones se cargan en Ajustes > Cotizaciones**, una por moneda, fecha
y fuente ('oficial', 'mep', 'tarjeta'...). La carga es local-first como todo lo
demas: se puede cargar sin conexion y sube despues. La pantalla dice lo que
importa: la cotizacion sirve para **ver** (convierte el patrimonio), y nunca
cambia un movimiento ya cargado, que conserva la que se le aplico.

Una cotizacion se puede corregir (un dedazo) o dar de baja; se corrige el valor
y la fuente, no el par ni la fecha, porque eso ya es otra cotizacion.

**Las cotizaciones se traen solas** de una API publica al abrir la app, una vez
por dia, y hay un boton para forzarlo. No hay cron: el servidor no siempre esta
prendido y el refresco es idempotente por fecha (ver 0005).

**La fuente automatica es la oficial, y es el estandar.** No se van a agregar
fuentes alternativas (MEP, tarjeta): quien quiera otra, la carga a mano.

**Cada moneda puede pasarse a manual** con un interruptor, y ese es el camino
para el dolar en Argentina, donde lo que uno paga no es la oficial. La pantalla
dice cual esta en automatico y cual a mano, y **a igual fecha la que cargo la
persona gana** sobre la automatica.

### 3.7 Recurrentes y plantillas

- **Recurrentes** (`recurring_rules`): sueldo, alquiler, seguros, servicios. Se
  definen una vez con su frecuencia (diaria/semanal/mensual/anual + cada N) y el
  sistema **genera la transaccion sola** cuando vence, avanzando `next_run_date`.
  Se pueden pausar. Una recurrente **siempre es automatica**: si hay que cargarla
  a mano no es una recurrente, es una plantilla, que ya existe para eso.

  **La generacion corre en el dispositivo**, sobre la base local, al abrir la app
  y con el boton "Ejecutar vencidas". No necesita conexion: antes la hacia el
  servidor y una semana sin red significaba que el alquiler no existia, que es
  justo lo contrario de lo que tiene que pasar solo.

  Si varios dias quedaron sin generar, se generan todos (una transaccion por
  periodo vencido). El **id de cada movimiento generado es determinista**, sale
  de (regla, fecha): dos dispositivos que generan la misma ocurrencia estando
  desconectados producen la **misma** fila y al sincronizar se colapsan en una,
  en vez de duplicar el gasto.

  El monto es el de la regla. Si el mes vino distinto —la luz, el gas— se edita
  el movimiento: es preferible a que no aparezca nada y el saldo quede mal.
- **Presupuestos recurrentes** (`budget_rules`): la asignacion recurrente de un
  sobre (ver 3.6). La misma corrida las aplica, tambien local: crea la asignacion
  del mes que falte. No pisa la que ya existe, venga de una corrida anterior o
  cargada a mano. Reemplaza a `default_budget`.
- **Plantillas** (`templates`): gastos o ingresos frecuentes precargados que se
  cargan con un toque (chips en la pantalla de alta). Pueden estar parciales y
  completarse al aplicarlas.

### 3.8 Visualizacion

- Lista de movimientos con busqueda y filtros
- Vista de calendario con total por dia, en una sola moneda (ver 3.6.1)
- Torta de gasto por categoria
- Evolucion de ingresos, gastos y saldo
- Saldos por cuenta y patrimonio total

**Estadisticas se lee por periodo**: dia, semana, mes o año. El periodo elegido
manda sobre toda la pantalla —la dona por categoria, ingresos contra egresos, el
gasto por etiqueta— y tambien sobre la evolucion, que muestra los ultimos seis
**de ese periodo**: con "Semana" son semanas, no meses. La semana arranca el
lunes. La eleccion se guarda por dispositivo: es una preferencia de lectura.

**Cada categoria puede tener un icono**, que aparece en la lista de categorias,
al elegir la categoria de un movimiento y en cada fila de movimiento.

**La categoria de un movimiento se elige de una lista, no de un desplegable.**
El `<select>` nativo no dibuja iconos ni sangria, asi que la jerarquia habia que
simularla con "Padre › Hija" en el texto. Ahora se ve igual que la pantalla de
categorias, que es donde uno las conoce, con buscador (una hija se encuentra
tambien por el nombre de su madre).

**El orden es alfabetico en los dos niveles** —padres, y dentro de cada padre sus
hijas— comparando en español, y es el mismo en todos lados: sale de una sola
funcion. No se usa el `ORDER BY` de la consulta porque la colacion de Postgres no
es la española y los acentos caen donde no va. En la fila el icono de la categoria reemplaza al del
tipo de movimiento, que era redundante: el signo y el color del monto ya dicen si
es gasto o ingreso. Un movimiento sin categoria (una transferencia) muestra el
del tipo.

Los iconos salen de un **subconjunto elegido a mano** de la libreria que ya usa
toda la interfaz, agrupado por tema y con buscador por sinonimos en español
("supermercado" encuentra el carrito). Es un subconjunto y no la libreria entera
—son ~1.700— porque elegir entre 1.700 no es elegir, es buscar. Se amplia cuando
falte alguno, no antes. Lo que se guarda es una clave propia, no el nombre del
icono en la libreria: si se saca uno del catalogo, esa categoria cae al icono por
defecto en vez de romper.

### 3.9 Bandeja de pendientes

Pantalla dedicada a resolver lo que la ingesta automatica no pudo completar.
Muestra un contador en la interfaz principal ("3 operaciones pendientes") y
permite completarlas de a una, con el dato faltante resaltado.

Al confirmar, la transaccion pasa a estado normal y recien ahi afecta saldos
y presupuestos.

### 3.10 Multiusuario y privacidad

Un usuario puede pertenecer a un **grupo** (pareja, familia). Cada transaccion
es:

- **Privada**: solo la ve quien la cargo
- **Compartida**: la ven todos los miembros del grupo

Los reportes del grupo suman solo lo compartido. Los reportes personales suman
todo lo propio. Nadie ve el detalle privado del otro.

### 3.11 Funcionamiento sin conexion

La aplicacion escribe siempre en una base local del dispositivo. Cuando hay
conexion, los cambios suben y bajan los de otros dispositivos.

Consecuencia de diseno: **los identificadores los genera el cliente**, no el
servidor. Si no, no se podria crear nada sin conexion.

**Lo que si necesita conexion**, y por que:

- **Exportar a CSV**: el archivo lo arma el servidor
  (`GET /transactions/export`). Se podria generar desde la base local, pero eso
  duplicaria el formato del CSV en dos lugares y se desincronizarian solos: se
  prefiere **una sola fuente de verdad** y avisar cuando no hay conexion.
- **Traer cotizaciones** (`POST /exchange-rates/refresh`): sale a una API
  publica, asi que la conexion es inherente. Sin ella se usa la ultima
  cotizacion conocida, que para eso esta cacheada (ver 0005).

Todo lo demas —cargar, editar, borrar, presupuestar, ver informes— funciona sin
conexion contra la base local.

Las **preferencias del usuario** (moneda base, tema, monedas manuales) estuvieron
un tiempo en esta lista y ya no: `users` se sincroniza —con las columnas
contadas, sin el hash de la contraseña— asi que se leen y se escriben local como
cualquier otra tabla, y viajan entre dispositivos (ver 0009).

**Por eso la API no tiene endpoints de lectura.** El cliente nunca le pregunta
al servidor por sus datos: los lee del SQLite del dispositivo. Lo que queda es
un **buzon de escritura** —los POST, PATCH y DELETE por los que la sync sube los
cambios— mas las excepciones de arriba. Los GET de lista y detalle existieron y
se borraron: nadie los llamaba, y tener dos implementaciones de la misma
consulta (una en el servidor, otra en el cliente) es como se desincronizan las
reglas sin que nadie se entere.

**La regla, para lo que venga**: toda accion del usuario se escribe **local
primero**, incluso las que tocan muchas filas. Reasignar 300 movimientos a otra
categoria genera 300 subidas en la cola en vez de un `UPDATE` del servidor, y
esta bien: son acciones raras, y hacerlas por endpoint las volveria imposibles
sin conexion. La eficiencia no justifica romper la regla principal de la
arquitectura.

### 3.12 Estrategia multidispositivo
 
Mango funciona en telefono y en computadora, y **no son la misma interfaz
estirada**: son dos arboles de componentes distintos que consumen los mismos
datos.
 
La razon es que los usos difieren. Cargar un gasto es una tarea de telefono: se
hace de pie, en un segundo, con una mano. Analizar el gasto del ano es una
tarea de escritorio: se hace sentado, comparando, con varias cosas a la vista.
Una interfaz que sirva para las dos termina sirviendo a medias para ambas.
 
El punto de corte es 1024 px de ancho. Por debajo se monta el arbol movil, por
encima el de escritorio. No hay estados intermedios.
 
**Lo que se comparte**: toda la logica de negocio, el acceso a datos, el estado,
las validaciones y el formateo. Vive en modulos agnosticos de la presentacion.
 
**Lo que cambia**: navegacion, densidad de informacion y composicion de
pantalla. En movil la navegacion es una barra inferior de cuatro destinos y el
alta de movimiento ocupa la pantalla completa. En escritorio hay barra lateral
fija, el alta es un panel lateral que deja la lista visible, y las listas son
tablas densas en vez de tarjetas apiladas.
 
El detalle de cada pantalla esta en `DESIGN.md`.

### 3.13 Apariencia y temas
 
La aplicacion usa un sistema de tokens de diseno: los componentes nunca
declaran colores literales, sino nombres de variables que un tema resuelve.
 
Cada tema define **dos modos**, claro y oscuro. No existe un tema que funcione
solo en uno de los dos. El modo activo se resuelve segun la preferencia del
usuario, con tres valores posibles: siempre claro, siempre oscuro, o seguir al
sistema operativo. El ultimo es el valor por defecto.
 
Ademas de los tokens habituales de fondo, texto y acciones, se agregan cinco
propios del dominio: gasto, ingreso, transferencia, pendiente y rechazado.
 
**Regla de accesibilidad**: ningun dato se comunica unicamente por color. Un
gasto se distingue por el signo y la posicion tanto como por el tono, porque
cerca del 8% de los varones tiene alguna deficiencia en la percepcion del rojo
y el verde.
 
El usuario puede elegir entre temas predefinidos y, mas adelante, sobreescribir
tokens puntuales para armar el propio. La preferencia se guarda en su registro
de usuario, asi que **viaja con la sincronizacion**: el tema elegido en el
telefono aparece en la computadora.
 
**Alcance por fase**: la arquitectura de tokens, los dos modos y los campos en
el esquema van desde la fase 1, porque agregarlos despues implica reescribir
todo el CSS. El editor de temas personalizados queda para la fase 3 o
posterior: es una pantalla mas y puede esperar.

---

## 4. Sistema automatico: la ingesta

Corre sin interfaz. Convierte correos en transacciones y las empuja por API.

### 4.1 Arquitectura

```
  Casilla de correo (Gmail)
          │  IMAP
          ▼
  ┌───────────────────┐
  │       n8n         │   Orquestador de flujos visuales.
  │                   │   Ya instalado en el servidor.
  │  1. Lee correos   │
  │  2. Parsea        │   Parsers propios por remitente
  │  3. Deduplica     │
  └─────────┬─────────┘
            │  HTTP POST /api/v1/transactions/import
            │  (red local, con token de servicio)
            ▼
  ┌───────────────────┐
  │   API de la app   │   Valida, resuelve cuenta y categoria,
  │                   │   marca pendiente si falta algo
  └───────────────────┘
```

n8n se comunica con la API **por red local**, sin salir a internet.

### 4.2 Parseo de correos

Cada remitente tiene su parser. El primero es el de las alertas de compra de
Visa, que tienen formato uniforme sin importar el banco emisor:

```
Comercio: SUBE VIAJES - BUSES
Pais: ARG
Ciudad: BuenosAires
Tarjeta: 8027
Tipo de transaccion: Compra
Moneda: ARS
Monto: 2302.72 (puede haber una diferencia en el monto real)
```

El parser extrae los campos y normaliza el monto, que llega en tres formatos
distintos segun el correo:

- `1.234,56` coma decimal, punto de miles (formato local)
- `1,234.56` punto decimal, coma de miles (formato ingles)
- `15.80` punto decimal sin miles (compras en el exterior)

El tercero es el peligroso: interpretarlo como separador de miles daria un
monto cien veces mayor.

Tambien detecta variantes que no son gastos:

- **Rechazos**: "acaba de ser RECHAZADA". Se guardan con estado propio y no
  afectan saldos.
- **Compras en el exterior**: traen el monto original mas una conversion
  aproximada entre parentesis.

El parser vive en el nodo Code de n8n y esta escrito en JavaScript.

### 4.3 Resolucion de la cuenta

Con la tarjeta y la moneda, el sistema busca la cuenta asociada:

```
Alerta: tarjeta 8027, moneda BRL
  -> buscar cuenta para (8027, BRL)
     -> encontrada:   completa la transaccion
     -> no encontrada: pendiente, motivo no_account_for_currency
```

### 4.4 Resolucion de la categoria

**El correo trae el comercio, nunca la categoria.** La clasificacion se
resuelve en tres pasos, de mas barato a mas caro:

**Paso 1 - Tabla de asociacion.** Se busca el comercio en la tabla descrita
en 3.5. Si hay coincidencia, se asigna esa categoria y la transaccion queda
completa. Instantaneo y sin costo.

**Paso 2 - Sugerencia con IA.** Si ninguna regla coincide, se consulta a un
modelo de lenguaje pasandole **unicamente el nombre del comercio**: nunca el
monto, ni la fecha, ni la cuenta, ni ningun otro dato.

La respuesta **nunca se aplica sola**. La transaccion queda con:

- una categoria sugerida
- una marca de que la sugerencia proviene de IA
- estado pendiente, motivo `category_suggested`

**Paso 3 - Pendiente sin sugerencia.** Si la IA no esta disponible o no
devuelve algo utilizable, queda pendiente con motivo `no_category`.

### 4.5 Aprendizaje por confirmacion

Toda sugerencia de IA aparece en la bandeja de pendientes para revision. La
persona puede:

- **Aceptarla**: la transaccion se completa **y** se crea una entrada nueva en
  la tabla de asociacion comercio-categoria.
- **Corregirla**: se aplica la categoria elegida por la persona **y** se crea
  la entrada con esa categoria.
- **Rechazarla**: la transaccion queda pendiente sin categoria.

En los tres casos, la decision final es humana. La consecuencia es que **el
sistema aprende**: cada comercio se clasifica una sola vez, y a partir de ahi
el paso 1 lo resuelve sin costo.

### 4.6 Deduplicacion

Cada transaccion importada lleva una clave estable derivada de fecha con
hora, monto, comercio y tarjeta. Un indice unico impide insertar dos veces lo
mismo, aunque el correo se procese repetidamente.

La hora es necesaria: dos viajes en colectivo el mismo dia por el mismo monto
son transacciones distintas.

### 4.7 Motivos de pendiente

| Motivo | Que falta |
|---|---|
| `no_account_for_currency` | La tarjeta no tiene cuenta asociada para esa moneda |
| `category_suggested` | Hay una categoria sugerida por IA esperando confirmacion |
| `no_category` | Ninguna regla coincidio y la IA no resolvio |
| `no_exchange_rate` | Compra en el exterior sin cotizacion aplicada |
| `parse_failed` | El correo no coincidio con ningun parser conocido |

Si un banco cambia el formato de sus correos, las transacciones aparecen como
pendientes en vez de perderse en silencio.

### 4.8 Interfaz entre n8n y la API

La API expone un endpoint de importacion que recibe transacciones ya
parseadas, con campos planos. n8n no conoce el modelo interno: la API resuelve
cuentas, categorias y estado.

Se autentica con un token de servicio, distinto de las credenciales de
usuario.

---

## 5. Decisiones fundacionales

Seis decisiones baratas al principio y muy caras de agregar despues.

### 5.1 Identificadores UUID generados por el cliente

Si el identificador lo asigna el servidor, no se puede crear una transaccion
sin conexion. Todos los IDs son UUID generados donde nace el registro.

El servidor tambien genera UUIDs para lo que crea el (importaciones,
recurrentes). No hay conflicto: el espacio es unico.

### 5.2 Montos como enteros en centavos

`2302.72` se guarda como `230272`. Nunca punto flotante: los errores de
redondeo en operaciones financieras se acumulan y son dificiles de rastrear.

### 5.3 Moneda explicita en cada transaccion

Aunque al principio solo se use una. Agregarla despues obliga a migrar toda la
tabla y decidir retroactivamente que moneda tenia cada registro.

### 5.4 Propietario y visibilidad desde el principio

Cada transaccion sabe de quien es y si es privada o compartida, aunque la
fase 1 sea de un solo usuario.

### 5.5 Borrado logico y marca de actualizacion

Nada se borra fisicamente: se marca con fecha de borrado. Sin esto es
imposible propagar a otros dispositivos un borrado hecho sin conexion.

### 5.6 Arquitectura de temas por usuario desde el principio

Los componentes nunca declaran colores literales: usan tokens que un tema
resuelve, y la preferencia (`theme_id`, `color_scheme`) vive en el registro del
usuario. **Eso** es lo que hay que tener desde el principio, porque agregarlo
despues implica reescribir todo el CSS.

Los campos del editor de temas, en cambio, **no**: hubo un `theme_custom` que
nadie escribia ni leia y se borro. Guardar una columna no adelanta trabajo; lo
que lo adelanta es la arquitectura de tokens (ver 3.13 y `DESIGN.md`).

---

## 6. Stack tecnologico

### 6.1 Base de datos: PostgreSQL

Tipos ricos (UUID, JSONB, TIMESTAMPTZ), indices parciales, restricciones de
integridad. Es lo que se necesita para datos financieros.

### 6.2 Sincronizacion: PowerSync Open Edition

**La sincronizacion no se escribe a mano.** Es la parte mas dificil del
proyecto y hay motores maduros que la resuelven.

PowerSync replica Postgres a una base SQLite en cada dispositivo, y maneja la
cola de escrituras sin conexion, los reintentos y la reconexion. La aplicacion
lee y escribe siempre local; el motor sincroniza en segundo plano.

**Por que PowerSync y no otro:**

- **Zero** exige TypeScript en el servidor. El esquema se define en un archivo
  TypeScript y los mutadores del cliente son siempre TypeScript; usarlo con
  otro lenguaje implica implementar el protocolo de push a mano y duplicar la
  logica de mutacion en dos lenguajes.
- **ElectricSQL** es Apache 2.0 y self-hosteable, pero solo hace el camino de
  lectura: la cola de escrituras hay que construirla. Ademas tenia bordes
  asperos en manejo de shapes y reconexion segun evaluaciones de 2026.
- **PowerSync** es agnostico al backend por diseno: el camino de escritura se
  implementa en la API propia, en el lenguaje que sea.

**Licencia**: PowerSync Open Edition es gratuita, self-hosteable e incluye
todas las funciones centrales. Se licencia bajo FSL, que es *source-available*
y no open source estricta: la restriccion existe para impedir que un proveedor
cloud lo revenda como servicio. Para uso personal es irrelevante. Los SDK de
cliente son Apache 2.0.

**Lo que hay que implementar en el backend:**

1. Un endpoint que genere el token JWT para los clientes
2. Un endpoint que reciba los cambios que suben los dispositivos

**Ventaja para este proyecto**: n8n escribe a Postgres y el motor propaga esas
transacciones a los dispositivos sin codigo adicional.

### 6.3 Backend: Python con FastAPI

Se evaluaron alternativas dejando de lado la familiaridad.

| Opcion | A favor | En contra |
|---|---|---|
| **Python / FastAPI** | Mejor ecosistema para manipular datos y para el analisis financiero que se quiere hacer a futuro. `Decimal` nativo. Pydantic para validacion. | Sin tipos compartidos con el frontend. |
| **TypeScript** | Un solo lenguaje; tipos y validaciones compartidos entre cliente y servidor. | Manejo de decimales mas pobre. Ecosistema que rota mas rapido. |
| **Go** | Un binario, poca memoria, buena concurrencia. | Verboso para CRUD, ecosistema chico para el dominio. |
| **Rust** | Correctitud y velocidad. | Desarrollo mucho mas lento sin beneficio real a esta escala. |

**Decision: Python con FastAPI.**

El argumento de "un solo lenguaje" era fuerte suponiendo Zero como motor. Con
un motor agnostico al backend ese argumento se cae, y pesa mas la versatilidad
de Python para el analisis de datos que se quiere hacer.

Sobre velocidad: irrelevante a esta escala. Ambos son I/O-bound y el trabajo
pesado lo hace PostgreSQL.

Complementos: SQLAlchemy como ORM, Alembic para migraciones.

### 6.4 Frontend: React con TypeScript, como PWA

- **Tailwind CSS + shadcn/ui**: componentes listos para adaptar. Es el
  ecosistema con mas material disponible, lo que importa para lograr una
  interfaz vistosa sin disenar todo desde cero.
- **Framer Motion**: animaciones.
- **SDK de PowerSync** para la base local.

Se eligio PWA sobre aplicacion nativa porque cubre Android e iOS con una sola
base de codigo. **Limitacion conocida: no permite widgets en la pantalla de
inicio**, que Money Manager si tiene.

El frontend se organiza en **dos arboles de componentes**, uno para movil y
otro para escritorio, que comparten toda la logica. Ver seccion 3.12.

La apariencia se define con tokens de diseno sobre las variables CSS de
shadcn, con modo claro y oscuro. Ver seccion 3.13 y `DESIGN.md`.

El frontend contiene solo logica de presentacion. La logica de negocio vive
en el backend.

### 6.5 Infraestructura

Docker Compose en servidor propio, accesible por red local y desde afuera
mediante Tailscale. Sin puertos abiertos a internet.

Servicios:

```
postgres      base de datos
powersync     motor de sincronizacion
api           FastAPI
n8n           ingesta desde correo (ya instalado)
```

---

## 7. Fases

### Fase 1 - Sistema manual, un usuario

Reemplazar el uso diario de Money Manager.

Cuentas, medios de pago, categorias con subcategorias, alta y edicion de los
tres tipos de movimiento, calculadora en el monto, autocompletado de comercio,
vista de lista y de calendario, estadisticas basicas, presupuestos mensuales,
recurrentes, plantillas, funcionamiento sin conexion, PWA instalable, codigo
de acceso, exportacion a CSV, y apariencia por usuario (tema con modo claro y
oscuro; sin editor todavia).

### Fase 2 - Sistema automatico

Endpoint de importacion, bandeja de pendientes, tabla de asociacion
comercio-categoria con aprendizaje por confirmacion, deduplicacion,
sugerencias con IA. Integracion con n8n.

### Fase 3 - Multiusuario y compartido

**Fase 3a (autenticacion): HECHA.** Login con username + clave (Argon2id),
sesion hasta cerrar sesion, reset por CLI del admin, y el PIN del dispositivo
conviviendo con el login de servidor. El detalle y las decisiones estan en la
**decision 0013**.

**Fase 3b.1 (grupos y membresia): HECHA.** Un grupo lo crea alguien, que queda de
`owner`; el owner agrega y saca miembros **por username desde la app** (sin mail,
como el resto de 3a). Grupos y membresia se administran por API y se leen del
SQLite local: bajan por un stream de sync parametrizado por las membresias del
usuario (`grupo` en sync-config), que convive con el personal (`mio`) sin
reemplazarlo. Verificado: un miembro ve el grupo, quien no es miembro no.

**Fase 3b.2 (compartir un movimiento): HECHA.** Un movimiento se marca privado o
compartido con un grupo (toggle en alta y detalle). De un movimiento compartido
viajan al grupo monto, comercio, fecha, categoria y tags, y quien lo cargo; lo
privado —cuenta, medio de pago, monto debitado, notas— **no** (no esta ni en la
base local de los demas). Hay una vista de actividad por grupo. Verificado punta
a punta: un miembro ve el gasto de otro con categoria y autor, sin los campos
privados, y quien no es miembro no ve nada.

**Fase 3b.2b (taxonomia del grupo): HECHA.** Ver decision 0014. Las categorias y
tags tienen ambito: personales (`owner_id`) o **del grupo** (`group_id`). Un
grupo **nace con el arbol por defecto** sembrado con su `group_id`; **cualquier
miembro** crea/edita las categorias del grupo (gestor en la pantalla del grupo).
Un **gasto compartido se categoriza obligatoriamente con una categoria del
grupo** (el selector, al elegir compartir, ofrece las del grupo, no las
personales): asi Ana y Beto usan la misma `Casa>Super` y el reporte del grupo
agrega bien. Las categorias/tags del grupo **viajan enteras** por el stream
`grupo` (`WHERE group_id IN mis_grupos`), ya no "solo la referenciada" (eso era
3b.2, corregido por 0014). Verificado punta a punta por API: un miembro crea una
categoria del grupo, y compartir con una categoria personal se rechaza.

**Fase 3b.2c (origen de grupo visible): HECHA.** Cada grupo tiene un **color**
(columna `groups.color`, migracion aditiva; se elige/edita en la pantalla de
grupos, cualquier miembro por API). Un **chip con ese color y el nombre del
grupo** marca el origen en todas partes: lista de Movimientos, recientes de
Inicio y detalle del movimiento. Los selectores de categoria quedan **scopeados**
(al compartir se ofrecen solo las categorias del grupo), asi la diferencia con
las personales se ve sola. **Grupos** pasa a la **navegacion principal** (antes
solo en Ajustes). Datos de demo: un segundo usuario (beto), grupo "Casa" (yo =
owner, color azul) con arbol por defecto + categorias distintivas
(Mascotas/Vacaciones/Regalos) y gastos compartidos de cada uno.

Los balances personales **no** cambian: el gasto compartido de otro no se debita
de tus cuentas.

**Fase 3b.3.1 (resumen y balance del grupo): HECHA.** Ver decision 0015. En la
pantalla del grupo hay un **resumen** (este mes / todo): total gastado, desglose
**por categoria** y **por miembro**, y un **balance en partes iguales** con la
sugerencia de **como saldar** ("Beto → Ana $X"). Se calcula en el cliente
(`lib/grupo.ts`, funcion pura con pruebas) sobre los gastos compartidos ya
sincronizados; sin endpoint ni tablas nuevas. No se mezclan monedas.

**Fase 3b.3.2 (splits desiguales): HECHA.** Al compartir un gasto se puede
**dividir** en el alta y en el detalle: partes **iguales** (eligiendo quienes
participan), **montos exactos** por persona, o **porcentajes**. Se guarda el monto
resuelto por miembro en `transaction_splits` (suma = total, garantizado por el
cliente). Sin dividir explicitamente, sigue siendo igual entre todos (no guarda
filas). El balance usa el split de cada gasto; si no tiene, cae a partes iguales.

**Fase 3b.3.3 (registro de pagos): HECHA.** Cada sugerencia de "como saldar"
tiene un boton **Saldar** que registra el pago (`settlements`: quien, a quien,
cuanto); el balance lo descuenta y la deuda desaparece. Los pagos registrados se
listan y se pueden **deshacer**. Cualquier miembro registra y deshace (0014/0015).
No mueven plata de ninguna cuenta: la deuda se salda por fuera.

**Fase 3b.3.4 (presupuesto del grupo): HECHA.** Ver 0016. En la pantalla del
grupo, un tope mensual por categoria del grupo contra lo gastado (barra de
progreso). Cualquier miembro lo pone/edita. Reusa `budgets` con `group_id`.

**Fase 3b.4 (cuenta conjunta): HECHA.** Ver 0016. Una cuenta puede ser del grupo
(`group_id`, `owner_id` NULL): la crea cualquier miembro, la ven todos, y **no**
aparece en las vistas personales. Un gasto pagado con la conjunta suma al grupo y
al presupuesto pero **no genera deuda** (`paid_from_group`): la plata ya es de
todos. `accounts.owner_id` paso a nullable.

**Fase 3b.4b (saldar y fondear): HECHA.** Ver 0017. Saldar una deuda tiene dos
formas: **marcar saldado** (registro reversible que no mueve plata, para deudas
chicas o saldadas por fuera) y **registrar pago** (solo el deudor: sale de su
cuenta y medio, se puede pagar **por partes**; baja su saldo). **Fondear** la caja
comun es una **transferencia** de una cuenta personal a la conjunta. Se corrigio
un bug por el que la deuda reaparecia tras saldar (la tabla `settlements` no
estaba en el stream del PowerSync cargado; ahora esta en `grupo` —sin cuenta ni
medio— y en `mio` —entera para el pagador—).

**Fase 3b.4c (cobro automatico al acreedor): HECHA.** Ver 0018. Cuando el deudor
registra un pago real, el servidor le crea al acreedor un **ingreso pendiente**
("Pago de X", sin cuenta). El acreedor lo ve en **"Cobros por confirmar"** (Inicio),
elige a que cuenta entro y lo confirma: recien ahi suma a su saldo. Si se deshace
el pago, el cobro se borra si sigue pendiente; si ya se confirmo, queda.

**Fase 3b.5 (notificaciones in-app): HECHA.** Ver 0019. Una **campanita** con
contador de no leidos (header movil y barra de escritorio) abre la **bandeja** de
avisos. Los crea el servidor en eventos (`pago_recibido`, `pago_deshecho`,
`miembro_agregado`); bajan por `mio`; el cliente solo los marca leidos. Tocar un
aviso lo marca leido y navega a su link.

Falta:
- **Push** (avisos fuera de la app): service worker + `PushManager` + VAPID +
  suscripciones + backend enviando. Requiere HTTPS (Caddy). Reusa los mismos
  eventos que ya escriben en `notifications`.
- Al **eliminar una categoria del grupo en uso** todavia no hay reasignacion
  (como si la hay en las personales): por ahora se archiva. Se completa en 3b.3.

**Sin correo electronico**: la identidad es un **nombre de usuario** y una clave.
El mail sirve para probar que sos dueño de una direccion, que importa cuando
cualquiera se registra solo; aca las cuentas las crea quien administra la
instancia, que ya sabe quien es cada uno. Sin mail no hay verificacion ni
recuperacion automatica de clave, asi que hace falta que **quien administra
pueda resetear una clave**. La columna `users.email` pasa a ser `username`
cuando se construya esto; hoy no se toca porque la forma puede cambiar.

Lo que si hay que resolver, y pesa mas que el mail:

- **Hasheo real de la clave, con Argon2id.** `password_hash` hoy guarda un `"!"`
  de relleno, que no puede coincidir con ningun hash y por eso es un placeholder
  seguro. Ojo con el nombre: hashear **no es encriptar**. Un hash no se
  desencripta ni con la clave del servidor, y eso es justamente lo que se quiere:
  ni quien administra puede leer la contraseña de otro.

  Argon2id sobre bcrypt porque es el recomendado hoy, es resistente a ataques por
  GPU y no tiene el tope de 72 bytes que trunca las frases largas. Dependencia:
  `argon2-cffi`.

- **Reset sin mail: clave temporal, no "cuenta sin clave".** Quien administra le
  pone una clave temporal a la persona y marca `must_change_password`; al entrar,
  la app la obliga a cambiarla antes de hacer nada.

  Se descarto la variante de "dejar la cuenta sin clave y que la app pida crear
  una al abrirla" por dos motivos. Uno, **la ventana**: mientras la cuenta este
  sin clave, quien abra la app primero se la queda, y antes del login no hay
  sesion que pruebe quien es. Dos, **para saber que esta sin clave** el cliente
  tendria que preguntarselo al servidor sin estar autenticado, y esa consulta
  dice que usuarios existen y cuales estan reseteables.
- **Transporte.** Hacia afuera de la casa todo va por **Tailscale**, que cifra
  punta a punta: ahi no hay problema. Adentro, por LAN pelada y HTTP, la clave y
  el token viajarian en claro, y quien este en el Wi-Fi los ve. La mejora mas
  barata no es poner TLS: es **entrar por el nombre de Tailscale tambien desde
  casa**, que funciona igual en la LAN y no cuesta una linea de codigo.

  **Mientras tanto esto ya esta expuesto, y mas:** hoy la API **no tiene auth**
  (`get_current_user_id` devuelve el usuario semilla sin mirar nada), asi que
  cualquiera que llegue al puerto 8000 lee y escribe todo. No publicar ese puerto
  fuera del tailnet hasta que exista el login.
- **Limite de intentos** en el login.

La particion de la sincronizacion **ya esta hecha** (ver 0009): falta el stream
de grupo, que convive con el personal.

### Fase 4 - Multimoneda y reparto

**Parte ya se adelanto** (ver 3.6.1, 3.6.2 y decision 0005): apenas aparecio una
cuenta en dolares, los informes que sumaban monedas distintas pasaron a ser un
error de correctitud, no una funcion faltante.

Tipos de cambio con historico, reportes convertidos a moneda base, division de
gastos entre personas, liquidacion de saldos.

### Fase 5 - Extras

Deudas y prestamos, metas de ahorro, adjuntar fotos de tickets, fechas de
cierre y vencimiento de tarjetas de credito.

---

## 8. Casos borde a no olvidar

**Tarjeta de credito**: el gasto y el pago del resumen son eventos distintos.
El gasto afecta el presupuesto en su fecha; el pago mueve plata entre cuentas
en otra fecha.

**Compra en el exterior**: se conoce el monto en moneda extranjera, pero el
monto real en la moneda de la cuenta llega despues, con la cotizacion que
aplico el banco.

**Transaccion rechazada**: no es un gasto. Se guarda con estado propio y no
afecta saldos.

**Cuentas archivadas**: no se borran, se archivan. El historico las necesita.

**Zona horaria**: una compra a las 23:50 del dia 31 debe caer en el mes
correcto segun la zona del usuario.

**Cambio de categoria retroactivo**: al renombrar o fusionar categorias, las
transacciones viejas deben seguir siendo coherentes.

**Correo con formato cambiado**: las transacciones deben aparecer como
pendientes, nunca perderse en silencio.

---

## 9. Como trabajar en este proyecto

**Este documento es el contexto permanente.** Se lee al inicio de cada sesion
para no reinventar decisiones ya tomadas.

**Incrementos chicos y verificables.** Una tabla, un endpoint, una pantalla.
Cada paso con su prueba antes de seguir.

**Plan antes de codigo.** Revisar que se va a hacer, corregir el rumbo, y
recien ahi ejecutar.

**Orden sugerido de construccion:**

1. Esquema y migraciones
2. Modelos y validaciones del backend
3. Endpoints basicos con pruebas
4. Frontend: pantalla de alta de transaccion, la mas usada
5. Integracion de PowerSync
6. El resto de las pantallas

**Desarrollo local primero.** Cuando funcione en la maquina de desarrollo, se
lleva al servidor.

---

## 10. Archivos del proyecto

| Archivo | Contenido |
|---|---|
| `ESPECIFICACION.md` | Este documento |
| `schema.sql` | Esquema completo de la base de datos, con comentarios |
| `parser-visa.js` | Parser de alertas de compra Visa, para el nodo Code de n8n |
| `DESIGN.md` | Guia de diseno: tokens, temas, los dos layouts y patrones de interfaz |
