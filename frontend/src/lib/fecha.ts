// Etiqueta de mes+anio "Septiembre de 2026". Capitaliza SOLO la primera letra:
// el `capitalize` de CSS title-casearia cada palabra ("Septiembre De 2026").
export function mesAnio(anio: number, mes: number): string {
  const s = new Date(anio, mes, 1).toLocaleDateString("es-AR", {
    month: "long",
    year: "numeric",
  })
  return s.charAt(0).toUpperCase() + s.slice(1)
}
