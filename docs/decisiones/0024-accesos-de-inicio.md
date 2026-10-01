# 0024 - Accesos de Inicio, y Ajustes solo para configurar

Estado: aceptada
Fecha: 2026-09-30

## Contexto

Todo lo que no entraba en la barra estaba en un solo lugar, la grilla "Gestión"
de Ajustes. Ahí convivían dos cosas distintas:

- **Configuración**, que se arma una vez: cuentas, categorías, medios de pago,
  etiquetas, cotizaciones.
- **Funciones de uso diario**: metas, deudas y préstamos, recurrentes,
  plantillas (y grupos, que ya está en la barra).

Llegar a una meta o a una deuda era Inicio → engranaje → Ajustes → buscar en la
grilla. Se pidió que Ajustes quede para configurar y que lo demás esté a mano
desde Inicio, como los accesos de MercadoPago: elegidos y ordenados por la
persona, con un máximo en el panel y un "+" para llegar al resto.

## Decision

### Panel de accesos en Inicio (móvil)

- **Cuatro accesos y un "Más"**, en una fila de cinco columnas, las mismas que
  la barra inferior (0022). Va debajo de la tarjeta de Resumen.
- Cada acceso es una baldosa: ícono en círculo `accent` y nombre corto en hasta
  dos líneas, con guion si una palabra no entra.
- **"Más"** (`/accesos`) lista **todos** los accesos, agrupados en Funciones y
  Configuración, y tiene **Editar**.
- **Editar**: arriba "En Inicio (n de 4)" con **subir, bajar y sacar**; abajo
  "Para sumar" con **+**, deshabilitado al llegar a 4 (con el aviso). Se ordena
  con botones y no arrastrando: arrastrar en una lista que scrollea es impreciso
  con el dedo, y WCAG 2.2 (2.5.7) pide una alternativa de un toque igual. Hay
  "Volver a los de fábrica".
- **De fábrica**: metas, deudas, recurrentes y plantillas, las cuatro funciones
  que estaban escondidas.
- **El catálogo** vive en `frontend/src/componentes/accesos.ts`. Los ids son
  estables porque se guardan. Además de las cuatro: estadísticas, transferencia
  y nuevo ingreso (acciones) y los cinco de configuración.

### Guardado: en el usuario

La elección y el orden se guardan en **`users.home_shortcuts`** (JSONB, lista de
ids). Viajan con la sync, como el tema y la moneda base, así que son iguales en
todos los dispositivos. Detalles:

- NULL = los de fábrica. Una lista vacía es una elección ("Inicio sin accesos"),
  no los de fábrica.
- Al leer se **normaliza**: los ids que ya no existen se descartan, igual que los
  repetidos, y la lista nunca pasa de 4. Un cliente más nuevo con un acceso que
  este no conoce no le rompe nada.
- El servidor no conoce el catálogo, solo cuida la forma: ids cortos en
  minúscula, con un techo de 12. El tope de 4 lo pone la pantalla, así que si el
  panel crece no hay que aflojar una validación (0012).
- La migración es aditiva: una columna opcional, en un solo paso.

### Escritorio: en la barra lateral

El panel **no se muestra en escritorio**: la barra lateral ya lista todos los
destinos (DESIGN.md 2). Se le suma un bloque **Herramientas** con metas, deudas,
recurrentes y plantillas, y Ajustes queda al final.

### Ajustes: solo configurar

La grilla "Gestión" pasa a **"Configuración"**: cuentas, categorías, medios de
pago, etiquetas y cotizaciones. Siguen ahí moneda, apariencia, seguridad y
exportar.

### "Volver" vuelve a donde se vino

Las pantallas que antes solo se abrían desde Ajustes tenían "Volver" con destino
fijo `/ajustes`. Ahora se abren desde Inicio, desde "Más", desde Ajustes o desde
un atajo, así que `useVolver(respaldo)` vuelve con el historial. Si la pantalla
se abrió directo, sin historial propio, va al respaldo (`/accesos` para las
funciones, `/ajustes` para la configuración). Grupos pierde su "Volver": es una
pestaña de la barra.

## Por que

Separar lo que se usa de lo que se configura es la misma regla que ya separaba
la barra de Ajustes. Los accesos elegibles resuelven que cada persona usa
funciones distintas (una vive en Deudas, otra en Recurrentes) sin sumar
destinos a una barra que ya está en su máximo (0022).

Cuatro, y no ocho, para que el panel sea una sola fila y no empuje el Resumen.
En el usuario, y no en el dispositivo, porque es una preferencia como el tema:
reinstalar la app o cambiar de teléfono no debería borrarla.

## Consecuencias

- Sumar una pantalla nueva de uso diario es sumarla al catálogo de accesos, no a
  Ajustes.
- Cuatro cosas van juntas en el mismo deploy (skill `nueva-migracion`): la
  migración `45f51c180886`, la columna en la regla de sync de `users`, reiniciar
  PowerSync y la columna en el esquema local.
- Tests: el catálogo y su edición (`accesos.test.ts`) y el ida y vuelta en la API
  con la forma que manda la sync (`test_users.py`).
