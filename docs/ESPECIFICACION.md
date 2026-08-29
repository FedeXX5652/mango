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

### 3.6 Presupuestos y metas

- **Presupuesto**: monto asignado a una categoria para un periodo (semanal,
  mensual o anual). Permite ver cuanto queda disponible.
- **Meta**: objetivo de ahorro con monto y fecha. "Viaje 2027", "Notebook
  nueva". Sirve para planificar hacia adelante.

### 3.7 Recurrentes y plantillas

- **Recurrentes**: sueldo, alquiler, seguros, servicios. Se definen una vez
  con su frecuencia y el sistema los genera solo, o avisa, segun se
  configure.
- **Plantillas**: gastos frecuentes precargados que se repiten con un toque.

### 3.8 Visualizacion

- Lista de movimientos con busqueda y filtros
- Vista de calendario con total por dia
- Torta de gasto por categoria
- Evolucion mensual de ingresos, gastos y saldo
- Saldos por cuenta y patrimonio total

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

Cinco decisiones baratas al principio y muy caras de agregar despues.

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

El frontend contiene solo logica de presentacion. La logica de negocio vive en
el backend.

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
de acceso, exportacion a CSV.

### Fase 2 - Sistema automatico

Endpoint de importacion, bandeja de pendientes, tabla de asociacion
comercio-categoria con aprendizaje por confirmacion, deduplicacion,
sugerencias con IA. Integracion con n8n.

### Fase 3 - Multiusuario y compartido

Registro, autenticacion, grupos familiares, visibilidad por transaccion,
reportes del grupo, presupuestos compartidos.

### Fase 4 - Multimoneda y reparto

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
