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
// que devuelve es-AR con mes corto y ocupa el doble. Se parsea a mano porque
// `new Date("2026-09-06")` interpreta el ISO corto como UTC y correria el dia.
export function formatearFechaCorta(iso: string): string {
  const [anio, mes, dia] = iso.slice(0, 10).split("-").map(Number)
  return new Date(anio, mes - 1, dia).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
}
