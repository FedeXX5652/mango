// Armado de los filtros para GET /transactions/export. La logica vive aca,
// separada de la pantalla, porque el borde de fechas es facil de errar: el
// backend filtra occurred_at >= date_from y occurred_at < date_to, o sea que
// el fin es EXCLUSIVO.

export type RangoExport = "mes" | "anio" | "todo" | "personalizado"

export interface OpcionesExport {
  rango: RangoExport
  // "YYYY-MM-DD" (solo cuando el rango es personalizado)
  desde?: string
  hasta?: string
  tipo?: string
  cuentaId?: string
  categoriaId?: string
}

function inicioDelDia(iso: string): Date {
  const [a, m, d] = iso.split("-").map(Number)
  return new Date(a, m - 1, d)
}

export function parametrosExport(
  o: OpcionesExport,
  hoy: Date = new Date(),
): Record<string, string> {
  const p: Record<string, string> = {}

  if (o.rango === "mes") {
    p.date_from = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString()
    p.date_to = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 1).toISOString()
  } else if (o.rango === "anio") {
    p.date_from = new Date(hoy.getFullYear(), 0, 1).toISOString()
    p.date_to = new Date(hoy.getFullYear() + 1, 0, 1).toISOString()
  } else if (o.rango === "personalizado") {
    if (o.desde) p.date_from = inicioDelDia(o.desde).toISOString()
    if (o.hasta) {
      // El dia elegido tiene que entrar completo: se corre al dia siguiente.
      const fin = inicioDelDia(o.hasta)
      fin.setDate(fin.getDate() + 1)
      p.date_to = fin.toISOString()
    }
  }
  // "todo" no manda fechas.

  if (o.tipo) p.kind = o.tipo
  if (o.cuentaId) p.account_id = o.cuentaId
  if (o.categoriaId) p.category_id = o.categoriaId
  return p
}

export function nombreExport(hoy: Date = new Date()): string {
  const y = hoy.getFullYear()
  const m = String(hoy.getMonth() + 1).padStart(2, "0")
  const d = String(hoy.getDate()).padStart(2, "0")
  return `mango-movimientos-${y}-${m}-${d}.csv`
}

// Un CSV con solo el encabezado no es un export util: conviene avisar en vez
// de bajar un archivo vacio.
export function tieneFilas(csv: string): boolean {
  return csv.trim().split("\n").length > 1
}
