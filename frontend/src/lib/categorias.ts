export interface CatBase {
  id: string
  name: string
  parent_id?: string | null
}

// Ordena categorias de forma jerarquica: cada padre seguido de sus hijas
// (alfabetico dentro de cada nivel). Con `incluir`, filtra a ese subconjunto
// pero conserva la posicion bajo el padre. Sirve para todos los <select> de
// categoria (que quede ordenado por categoria y luego subcategoria).
export function ordenarJerarquico<T extends CatBase>(todas: T[], incluir?: Set<string>): T[] {
  const porNombre = (a: T, b: T) => a.name.localeCompare(b.name, "es")
  const padres = todas.filter((c) => !c.parent_id).sort(porNombre)
  const hijasDe = (id: string) => todas.filter((c) => c.parent_id === id).sort(porNombre)

  const res: T[] = []
  const agregar = (c: T) => {
    if (!incluir || incluir.has(c.id)) res.push(c)
  }
  for (const p of padres) {
    agregar(p)
    for (const h of hijasDe(p.id)) agregar(h)
  }
  // Huerfanas (padre ausente en la lista): al final.
  const vistos = new Set(res.map((c) => c.id))
  for (const c of todas) if (!vistos.has(c.id)) agregar(c)
  return res
}

// El ajuste de saldo (0033): dos categorias del sistema, una por kind, que el
// servidor crea para cada usuario. No se eligen ni se administran: van fuera de
// los selectores y de la lista de Categorias. En los informes, si (son un gasto
// o un ingreso mas).
export const AJUSTE = { income: "ajuste_ingreso", expense: "ajuste_egreso" } as const

export function esAjuste(systemKey: string | null | undefined): boolean {
  return systemKey === AJUSTE.income || systemKey === AJUSTE.expense
}

// Para el WHERE de las consultas de categorias que se eligen o se administran.
export const SIN_AJUSTE = `(system_key IS NULL OR system_key NOT IN ('${AJUSTE.income}', '${AJUSTE.expense}'))`
