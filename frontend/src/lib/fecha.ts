// Etiqueta de mes+anio "Septiembre de 2026". Capitaliza SOLO la primera letra:
// el `capitalize` de CSS title-casearia cada palabra ("Septiembre De 2026").
export function mesAnio(anio: number, mes: number): string {
  const s = new Date(anio, mes, 1).toLocaleDateString("es-AR", {
    month: "long",
    year: "numeric",
  })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// Fecha en formato ISO corto (YYYY-MM-DD), que es como se guarda un DATE.
// `toISOString()` no sirve: devuelve UTC, y en Argentina un momento de la noche
// cae en el dia siguiente (ESPECIFICACION 8, zona horaria).
export function fechaISO(d: Date): string {
  const mes = String(d.getMonth() + 1).padStart(2, "0")
  const dia = String(d.getDate()).padStart(2, "0")
  return `${d.getFullYear()}-${mes}-${dia}`
}

// "2026-09-06" -> "06/09/2026". Numerica y no "06 de sept de 2026", que es lo
// que devuelve es-AR con mes corto y ocupa el doble.
//
// Dos entradas posibles, y cada una se lee distinto:
// - un DATE ("2026-09-06") se parsea a mano, porque `new Date("2026-09-06")`
//   lo toma como medianoche UTC y en Argentina daria el dia anterior;
// - un momento ("2026-10-02T02:53:00Z") se pasa a la hora local: cortarle los
//   primeros 10 caracteres daba el dia UTC, y lo cargado despues de las 21 en
//   Argentina aparecia con la fecha de mañana.
export function formatearFechaCorta(iso: string): string {
  const [anio, mes, dia] = iso.includes("T")
    ? [...diaLocal(iso)]
    : iso.slice(0, 10).split("-").map(Number)
  return new Date(anio, mes - 1, dia).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
}

// [año, mes (1-12), dia] de un momento, en la hora local.
function diaLocal(iso: string): [number, number, number] {
  const d = new Date(iso)
  return [d.getFullYear(), d.getMonth() + 1, d.getDate()]
}

// Las listas de movimientos se agrupan por dia (DESIGN.md 7) con una clave
// LOCAL: con la fecha UTC, un gasto de las 23 caia en el dia siguiente.
export function claveDia(iso: string): string {
  const [anio, mes, dia] = diaLocal(iso)
  return `${anio}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`
}

// Encabezado de un dia: "Hoy", "Ayer" o "6 de septiembre" (con el año si no es
// el actual).
export function etiquetaDia(iso: string, hoy: Date = new Date()): string {
  const d = new Date(iso)
  const ayer = new Date(hoy)
  ayer.setDate(hoy.getDate() - 1)
  const mismoDia = (a: Date, b: Date) => a.toDateString() === b.toDateString()
  if (mismoDia(d, hoy)) return "Hoy"
  if (mismoDia(d, ayer)) return "Ayer"
  const opciones: Intl.DateTimeFormatOptions = { day: "numeric", month: "long" }
  if (d.getFullYear() !== hoy.getFullYear()) opciones.year = "numeric"
  return d.toLocaleDateString("es-AR", opciones)
}
