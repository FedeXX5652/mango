// Los informes se leen SIEMPRE en una moneda a la vez. Sumar montos de monedas
// distintas da un numero que no significa nada, y convertir exige cotizaciones
// (ver ESPECIFICACION 3.6.1 y decision 0005): hasta que existan, el informe
// elige una moneda y lo dice.

// Monedas presentes en los datos, sin repetir y en orden estable: la base
// primero, porque es la de casi todo, y el resto alfabetico.
export function ordenarMonedas(codigos: (string | null | undefined)[], base: string): string[] {
  const limpias = new Set<string>()
  for (const c of codigos) {
    const cur = c?.trim().toUpperCase()
    if (cur) limpias.add(cur)
  }
  const b = base.trim().toUpperCase()
  const resto = [...limpias].filter((c) => c !== b).sort()
  return limpias.has(b) ? [b, ...resto] : resto
}

// Moneda con la que se abre el informe: la base si tiene datos; si no, la
// primera disponible. Sin datos devuelve la base, que es lo que va a mostrar el
// estado vacio.
export function monedaPorDefecto(disponibles: string[], base: string): string {
  const b = base.trim().toUpperCase()
  if (disponibles.length === 0) return b
  return disponibles.includes(b) ? b : disponibles[0]
}
