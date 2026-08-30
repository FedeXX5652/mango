# Tema por defecto - Mango

Color de marca: **`#FDBE02`**

Todos los pares de texto verificados contra WCAG 2.1. Ninguno baja de AA
(4.5:1); la mayoria alcanza AAA (7:1).

Implementacion en `src/styles/tema-mango.css`. Uso y reglas de aplicacion en
`DESIGN.md`.

---

## La regla del amarillo

El mango tiene luminancia alta. Medido:

| Combinacion | Contraste | Resultado |
|---|---|---|
| `#FDBE02` sobre blanco | 1.67:1 | inusable para texto |
| `#FDBE02` sobre `#14120C` | 12.54:1 | AAA |

De ahi salen tres reglas que valen para toda la aplicacion:

- En modo claro el mango es **color de relleno**, con texto oscuro encima.
- En modo claro **nunca** es color de texto sobre fondo claro.
- En modo oscuro **si** puede ser color de texto.

Por eso el boton principal es mango con texto casi negro, y no al reves.

---

## Modo claro

### Superficies

| Token | Hex |
|---|---|
| `background` | `#FFFCF5` |
| `foreground` | `#1C1917` |
| `card` | `#FFFFFF` |
| `card-foreground` | `#1C1917` |
| `popover` | `#FFFFFF` |
| `popover-foreground` | `#1C1917` |

### Jerarquia

| Token | Hex |
|---|---|
| `muted` | `#F5F2EA` |
| `muted-foreground` | `#6B6259` |
| `secondary` | `#F5F2EA` |
| `secondary-foreground` | `#1C1917` |

### Marca

| Token | Hex |
|---|---|
| `primary` | `#FDBE02` |
| `primary-foreground` | `#1A1400` |
| `accent` | `#FEF0C3` |
| `accent-foreground` | `#4A3A00` |

### Estructura

| Token | Hex |
|---|---|
| `border` | `#D8CFBA` |
| `input` | `#CFC5AD` |
| `ring` | `#D9A300` |

### Destructivo

| Token | Hex |
|---|---|
| `destructive` | `#C62828` |
| `destructive-foreground` | `#FFFFFF` |

### Dominio

| Token | Hex |
|---|---|
| `expense` | `#C62828` |
| `income` | `#00795B` |
| `transfer` | `#1F5FBF` |
| `pending` | `#6D45C7` |
| `rejected` | `#6B6259` |

---

## Modo oscuro

### Superficies

| Token | Hex |
|---|---|
| `background` | `#14120C` |
| `foreground` | `#F2EDE1` |
| `card` | `#262218` |
| `card-foreground` | `#F2EDE1` |
| `popover` | `#262218` |
| `popover-foreground` | `#F2EDE1` |

### Jerarquia

| Token | Hex |
|---|---|
| `muted` | `#2E291D` |
| `muted-foreground` | `#A8A093` |
| `secondary` | `#2E291D` |
| `secondary-foreground` | `#F2EDE1` |

### Marca

| Token | Hex |
|---|---|
| `primary` | `#FDBE02` |
| `primary-foreground` | `#14120C` |
| `accent` | `#3A2F10` |
| `accent-foreground` | `#FDD34D` |

### Estructura

| Token | Hex |
|---|---|
| `border` | `#474030` |
| `input` | `#474030` |
| `ring` | `#FDBE02` |

### Destructivo

| Token | Hex |
|---|---|
| `destructive` | `#FF8A80` |
| `destructive-foreground` | `#14120C` |

### Dominio

| Token | Hex |
|---|---|
| `expense` | `#FF8A80` |
| `income` | `#4ADE9B` |
| `transfer` | `#7FB0FF` |
| `pending` | `#C0A6FF` |
| `rejected` | `#A8A093` |

---

## Otros valores

| Token | Valor |
|---|---|
| `radius` | `0.5rem` |

---

## Contrastes verificados

### Modo claro

| Par | Contraste | Nivel |
|---|---|---|
| Texto principal sobre fondo | 17.07:1 | AAA |
| Texto secundario sobre fondo | 5.83:1 | AA |
| Texto en tarjeta | 17.49:1 | AAA |
| Texto sobre boton mango | 10.96:1 | AAA |
| Texto sobre acento | 9.74:1 | AAA |
| `expense` sobre fondo | 5.49:1 | AA |
| `income` sobre fondo | 5.27:1 | AA |
| `transfer` sobre fondo | 5.94:1 | AA |
| `pending` sobre fondo | 6.16:1 | AA |
| `rejected` sobre fondo | 5.83:1 | AA |

### Modo oscuro

| Par | Contraste | Nivel |
|---|---|---|
| Texto principal sobre fondo | 16.03:1 | AAA |
| Texto secundario sobre fondo | 7.24:1 | AAA |
| Texto en tarjeta | 13.57:1 | AAA |
| Texto sobre boton mango | 11.18:1 | AAA |
| Texto sobre acento | 9.16:1 | AAA |
| `expense` sobre fondo | 6.95:1 | AA |
| `income` sobre fondo | 9.22:1 | AAA |
| `transfer` sobre fondo | 7.22:1 | AAA |
| `pending` sobre fondo | 7.66:1 | AAA |
| `rejected` sobre fondo | 6.13:1 | AA |

---

## Decisiones de la paleta

**Neutrales calidos.** El fondo claro es `#FFFCF5` en vez de blanco puro y el
oscuro es `#14120C` en vez de negro. Ambos con tinte calido. Con grises frios
el amarillo se ve fuera de lugar.

**El negro puro se evita en modo oscuro.** Texto claro sobre negro absoluto
produce halo y fatiga visual.

**`primary` es el mismo en los dos modos.** Es el color de marca y no cambia;
lo que cambia es el texto que va encima.

**`pending` es violeta y no ambar.** El ambar seria lo intuitivo para "en
espera", pero chocaria con el mango de la marca.

**Los colores de dominio se desaturan en modo oscuro.** Un rojo que funciona
sobre blanco vibra desagradablemente sobre fondo oscuro.

**La elevacion se marca distinto en cada modo.** En claro la tarjeta es blanca
sobre fondo hueso y se distingue por sombra. En oscuro es mas clara que el
fondo y se distingue por luminosidad.

---

## Advertencia de accesibilidad

Los cinco tokens de dominio se distinguen **por tono, casi nada por
luminancia**. Medido, el par mas parecido da 1.02:1 en modo claro y 1.04:1 en
oscuro.

Para quien no percibe bien el rojo y el verde, gasto e ingreso pueden verse
practicamente iguales.

**Por eso el tipo de movimiento nunca se comunica solo por color.** Siempre
acompanado de:

- signo: `-$ 2.302,72` / `+$ 150.000,00`
- icono que identifique el tipo
- o el estado escrito, para pendiente y rechazado