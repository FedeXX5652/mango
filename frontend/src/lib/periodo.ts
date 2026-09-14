// La ventana de tiempo que mira Estadisticas: un dia, una semana, un mes o un
// año. Todo el resto de la pantalla —la dona por categoria, ingresos contra
// egresos, el gasto por etiqueta— se calcula sobre esta ventana.
//
// Es puro y aparte porque las fechas son donde se cometen los errores: la
// semana que arranca lunes y no domingo, el mes que cambia de año al avanzar,
// el 31 que no existe en el mes siguiente.
//
// Los limites se devuelven como ISO completo y **en hora local**: las consultas
// comparan contra `occurred_at`, que se guarda asi. Usar UTC correria los
// movimientos de la noche al dia siguiente (ESPECIFICACION 8).

export type TipoPeriodo = "dia" | "semana" | "mes" | "anio"

export interface Ventana {
  // Limite inferior, inclusive.
  inicio: string
  // Limite superior, EXCLUSIVE: las consultas usan `>= inicio AND < fin`.
  fin: string
  // Como se nombra en pantalla.
  etiqueta: string
}

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"]
const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
]

function iso(d: Date): string {
  return d.toISOString()
}

function mayuscula(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// Lunes de la semana de `d`. `getDay()` da 0 para domingo, asi que el domingo
// pertenece a la semana que arranco el lunes anterior, no a la que empieza.
function lunesDe(d: Date): Date {
  const dia = d.getDay()
  const atras = dia === 0 ? 6 : dia - 1
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - atras)
}

// La ventana que contiene a `ancla`.
export function ventanaDe(tipo: TipoPeriodo, ancla: Date): Ventana {
  const y = ancla.getFullYear()
  const m = ancla.getMonth()
  const d = ancla.getDate()

  if (tipo === "dia") {
    return {
      inicio: iso(new Date(y, m, d)),
      fin: iso(new Date(y, m, d + 1)),
      etiqueta: `${mayuscula(DIAS[ancla.getDay()])} ${d} de ${MESES[m]}`,
    }
  }

  if (tipo === "semana") {
    const lunes = lunesDe(ancla)
    const domingo = new Date(lunes.getFullYear(), lunes.getMonth(), lunes.getDate() + 6)
    // Si la semana cruza de mes, se nombran los dos: "29 sep - 5 oct".
    const mismoMes = lunes.getMonth() === domingo.getMonth()
    const etiqueta = mismoMes
      ? `${lunes.getDate()} al ${domingo.getDate()} de ${MESES[lunes.getMonth()]}`
      : `${lunes.getDate()} de ${MESES[lunes.getMonth()]} al ${domingo.getDate()} de ${MESES[domingo.getMonth()]}`
    return {
      inicio: iso(lunes),
      fin: iso(new Date(lunes.getFullYear(), lunes.getMonth(), lunes.getDate() + 7)),
      etiqueta,
    }
  }

  if (tipo === "mes") {
    return {
      inicio: iso(new Date(y, m, 1)),
      fin: iso(new Date(y, m + 1, 1)),
      etiqueta: `${mayuscula(MESES[m])} de ${y}`,
    }
  }

  return {
    inicio: iso(new Date(y, 0, 1)),
    fin: iso(new Date(y + 1, 0, 1)),
    etiqueta: String(y),
  }
}

// Corre el ancla un periodo hacia adelante (`pasos` 1) o atras (-1).
//
// Se mueve el ANCLA y no la ventana, y para el mes se ancla al dia 1: si el
// ancla fuera el 31 de enero, "mes siguiente" caeria en marzo, porque el 31 de
// febrero no existe y JavaScript lo desborda en silencio.
export function correr(tipo: TipoPeriodo, ancla: Date, pasos: number): Date {
  const y = ancla.getFullYear()
  const m = ancla.getMonth()
  const d = ancla.getDate()
  if (tipo === "dia") return new Date(y, m, d + pasos)
  if (tipo === "semana") return new Date(y, m, d + pasos * 7)
  if (tipo === "mes") return new Date(y, m + pasos, 1)
  return new Date(y + pasos, 0, 1)
}

// Los ultimos `cantidad` periodos hasta el de `ancla`, del mas viejo al mas
// nuevo. Es la serie del grafico de evolucion, que sigue al periodo elegido:
// con "Semanal" muestra semanas, no meses.
export function serie(tipo: TipoPeriodo, ancla: Date, cantidad: number): Ventana[] {
  const salida: Ventana[] = []
  for (let i = cantidad - 1; i >= 0; i--) {
    salida.push(ventanaDe(tipo, correr(tipo, ancla, -i)))
  }
  return salida
}

// Etiqueta corta para el eje del grafico, donde no entra la larga.
export function etiquetaCorta(tipo: TipoPeriodo, v: Ventana): string {
  const d = new Date(v.inicio)
  if (tipo === "dia") return `${d.getDate()}/${d.getMonth() + 1}`
  if (tipo === "semana") return `${d.getDate()}/${d.getMonth() + 1}`
  if (tipo === "mes") return MESES[d.getMonth()].slice(0, 3)
  return String(d.getFullYear())
}
