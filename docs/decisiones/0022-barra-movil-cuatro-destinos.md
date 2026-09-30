# 0022 - Barra movil: cuatro destinos fijos y el "+" al centro

Estado: aceptada
Fecha: 2026-09-30

## Contexto

DESIGN.md 2 fijó desde el principio la barra inferior del móvil: **cuatro
destinos y el botón "+" elevado al centro**, con Ajustes en el header de Inicio.
Cuando llegó Grupos (fase 3b) se sumó como quinto destino. Para que entrara, la
grilla pasó a calcular sus columnas (cinco destinos más el "+" = seis) y a partir
la lista en dos y tres. El resultado:

- El "+" quedó **32 px a la izquierda del centro** en un teléfono de 390 px (30 px
  en uno de 360).
- Tres etiquetas no entraban en su columna (65 px en 390, 60 px en 360):
  **"Presupuesto" y "Estadísticas" se pisaban**.
- El destino activo se marcaba **solo por color**, y en amarillo sobre blanco
  (1,7:1): falla el contraste y la regla de DESIGN.md 9.

El error fue sumar un destino sin revisar la regla que lo impedía, y aceptar a
sabiendas un "+" corrido. La auditoría completa que salió de esto (móvil y
escritorio, las 19 vistas, con axe y chequeos de layout) está resumida en
`docs/BACKLOG.md`.

## Opciones evaluadas

1. **Cinco destinos más el "+"** (lo que había): el "+" nunca queda al centro y
   las etiquetas no entran.
2. **Cuatro destinos y un "Más"** con el resto: suma un toque y un menú para
   llegar a lo que quedó afuera.
3. **Sacar el "+" de la barra** y hacerlo flotante: DESIGN.md dice
   explícitamente que no hay botón flotante; el "+" de la barra es la acción
   principal.
4. **Cuatro destinos y sacar uno.** ¿Cuál?
   - **Estadísticas**: analizar es tarea de escritorio (DESIGN.md 2). En el
     teléfono, la pregunta diaria ("¿cómo viene el mes?") ya la contesta la
     tarjeta de Resumen de Inicio.
   - **Presupuesto**: "¿cuánto me queda en el sobre?" es la consulta de antes de
     comprar. Es de todos los días y de teléfono.
   - **Grupos**: en un hogar se usa a diario (quién puso qué, saldar).

## Decision

La opción 4, sacando **Estadísticas solo en el móvil**:

**Inicio · Movimientos · [+] · Presupuesto · Grupos**

- **Cinco columnas iguales**: el "+" cae en la del medio, el centro exacto de la
  pantalla. La grilla es fija y la cantidad también: un test
  (`navegacion.test.ts`) exige cuatro destinos móviles, para que nadie sume un
  quinto "apretado".
- **A Estadísticas se llega por dos caminos**:
  - desde la tarjeta de Resumen de Inicio, con un enlace "Ver estadísticas" al
    pie de la tarjeta (44 px de alto);
  - con el atajo del ícono de la app (0023).
- **El escritorio no cambia**: la barra lateral sigue con todos los destinos,
  Ajustes incluido.
- **El destino activo** se marca con una pastilla de fondo amarillo detrás del
  ícono (con `primary-foreground`) y la etiqueta en negrita, no solo con color.
- La barra respeta el **borde seguro** del teléfono (`env(safe-area-inset-bottom)`):
  en un iPhone el indicador de inicio ya no la tapa.

### Por qué un enlace y no la tarjeta entera

Se propuso que la tarjeta de Resumen entera fuera tocable. No se hizo porque la
tarjeta tiene controles adentro: Global/Por moneda, el selector de moneda y
"Cargarla". Un enlace no puede contener botones (es HTML inválido y los lectores
de pantalla lo leen mal), y un área tocable que cubra los controles hace navegar
por error al tocar cerca de ellos. El enlace al pie, con el ancho completo de la
tarjeta, se toca igual de fácil.

Las **tarjetas de cuenta** de Inicio no tienen controles adentro. A dónde llevan
(a Movimientos filtrado por esa cuenta o a Estadísticas) queda pendiente de
decidir: ver `docs/BACKLOG.md`.

## Por que

Cuatro destinos es lo único que deja el "+" al centro sin achicar nada. De los
candidatos a salir, Estadísticas es el único que en el teléfono ya tiene otro
camino natural (el Resumen, del que es el detalle) y el que menos se usa desde
ahí.

Lo que se pierde: Estadísticas pasa de un toque a dos en el móvil (Inicio → Ver
estadísticas). Con el atajo del ícono, en Android queda a una pulsación larga.

## Consecuencias

- Sumar un destino a la barra móvil es **reemplazar** otro, con decisión propia.
- `DESTINOS_MOVIL` y `DESTINOS` siguen separados en `componentes/navegacion.ts`.
  El test verifica que todo destino móvil exista también en escritorio.
