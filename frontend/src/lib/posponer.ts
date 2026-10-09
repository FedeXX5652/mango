// "Más tarde" de un vencimiento (1.5.0, etapa 2, ver 0030; decision R2): atajos
// para elegir hasta cuando callar el aviso. A cualquier hora (2026-10-08: se saco
// la franja de 8 a 22).
//
// En la hora LOCAL del dispositivo: "mañana a las 9" es la de la persona. Se
// guarda como instante (ISO, UTC) y el servidor lo compara con su reloj.

export type AtajoPosponer = "1h" | "3h" | "manana" | "lunes"

export const ATAJOS_POSPONER: { valor: AtajoPosponer; etiqueta: string }[] = [
  { valor: "1h", etiqueta: "En 1 hora" },
  { valor: "3h", etiqueta: "En 3 horas" },
  { valor: "manana", etiqueta: "Mañana a las 9" },
  { valor: "lunes", etiqueta: "El lunes a las 9" },
]

function alas9(d: Date, masDias: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + masDias)
  r.setHours(9, 0, 0, 0)
  return r
}

export function cuandoPosponer(atajo: AtajoPosponer, ahora: Date): Date {
  switch (atajo) {
    case "1h":
      return new Date(ahora.getTime() + 3_600_000)
    case "3h":
      return new Date(ahora.getTime() + 3 * 3_600_000)
    case "manana":
      return alas9(ahora, 1)
    case "lunes": {
      // El proximo lunes; si hoy es lunes, el de la semana que viene.
      const dia = ahora.getDay() // 0 = domingo
      const faltan = (8 - dia) % 7 || 7
      return alas9(ahora, faltan)
    }
  }
}

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"]

function hora(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
}

function mismoDia(a: Date, b: Date): boolean {
  return a.toDateString() === b.toDateString()
}

// "hoy a las 15:00", "mañana a las 09:00", "el lunes 19/10/2026 a las 09:00".
export function textoHasta(hasta: Date, ahora: Date): string {
  const manana = new Date(ahora)
  manana.setDate(ahora.getDate() + 1)
  const p = (n: number) => String(n).padStart(2, "0")
  const cuando = mismoDia(hasta, ahora)
    ? "hoy"
    : mismoDia(hasta, manana)
      ? "mañana"
      : `el ${DIAS[hasta.getDay()]} ${p(hasta.getDate())}/${p(hasta.getMonth() + 1)}/${hasta.getFullYear()}`
  return `${cuando} a las ${hora(hasta)}`
}
