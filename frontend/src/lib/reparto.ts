// Repartir el monto de un gasto compartido (0015, 0026). Todo en centavos
// enteros, sin punto flotante (regla 1): los porcentajes van en centesimas de
// punto (33,33 % = 3333) y las cuentas se hacen con BigInt, exactas para
// cualquier monto.

// Partes enteras proporcionales a `pesos` que suman EXACTO `total`. Metodo del
// mayor resto: cada uno recibe el piso de su cuota y los centavos que sobran
// van de a uno a los de mayor fraccion; a igual fraccion, al que esta primero.
// Un peso 0 recibe 0 siempre (antes, el resto podia caerle a alguien con 0 %).
// Sin ningun peso positivo, todos 0.
export function repartirPorPesos(total: number, pesos: number[]): number[] {
  const suma = pesos.reduce((s, p) => s + p, 0)
  if (total <= 0 || suma <= 0) return pesos.map(() => 0)
  const T = BigInt(total)
  const S = BigInt(suma)
  const cuotas = pesos.map((p, i) => {
    const bruto = T * BigInt(p)
    return { i, base: bruto / S, resto: bruto % S }
  })
  let sobran = T - cuotas.reduce((s, c) => s + c.base, 0n)
  const porResto = [...cuotas].sort((a, b) =>
    a.resto === b.resto ? a.i - b.i : a.resto > b.resto ? -1 : 1,
  )
  const extra = new Set<number>()
  for (const c of porResto) {
    if (sobran === 0n) break
    if (pesos[c.i] <= 0) continue
    extra.add(c.i)
    sobran -= 1n
  }
  return cuotas.map((c) => Number(c.base) + (extra.has(c.i) ? 1 : 0))
}

// "33,33" -> 3333 (centesimas de punto). Hasta dos decimales, con coma o punto.
// Lo que no es un porcentaje valido (letras, tres decimales, negativo) -> null.
export function aCentesimas(texto: string): number | null {
  const s = texto.trim().replace(",", ".")
  const m = s.match(/^(\d+)(?:\.(\d{0,2}))?$/)
  if (!m) return null
  return Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"))
}

// "2" -> 2. Partes enteras y no negativas (2 a 1 para quien vale por dos).
export function aPartes(texto: string): number | null {
  const s = texto.trim()
  return /^\d+$/.test(s) ? Number(s) : null
}

// El reparto por defecto de un grupo tal como baja de la sync (JSONB en texto en
// SQLite): {user_id: partes}. Lo que no se pueda leer cuenta como "sin reparto"
// (partes iguales): un dato roto no puede trabar el alta.
export function leerReparto(texto: string | null | undefined): Record<string, number> | null {
  if (!texto) return null
  try {
    const v: unknown = JSON.parse(texto)
    if (!v || typeof v !== "object" || Array.isArray(v)) return null
    const r: Record<string, number> = {}
    for (const [k, p] of Object.entries(v)) {
      if (typeof p !== "number" || !Number.isInteger(p) || p < 0) return null
      r[k] = p
    }
    return Object.values(r).some((p) => p > 0) ? r : null
  } catch {
    return null
  }
}

// Las filas de un reparto por pesos, con los ids en el orden de `pesos` (el del
// balance: por id). Todos con el mismo peso es "igual entre todos", el default,
// que no guarda filas: null.
export function filasDeReparto(
  ids: string[],
  pesos: number[],
  reparto: number[],
): { user_id: string; amount: number }[] | null {
  if (pesos.every((p) => p > 0 && p === pesos[0])) return null
  return ids.map((id, i) => ({ user_id: id, amount: reparto[i] })).filter((x) => x.amount > 0)
}

// Un gasto nuevo del grupo con su reparto por defecto (0026), sin editor: el que
// genera una recurrente del grupo (1.15.0). Como el alta, quien entro despues
// de fijar el reparto tiene 0 partes. Sin reparto (o sin nadie con partes),
// igual entre todos: null.
export function splitsDelGrupo(
  total: number,
  miembros: string[],
  partes: Record<string, number> | null,
): { user_id: string; amount: number }[] | null {
  if (!partes) return null
  const ids = [...miembros].sort((a, b) => a.localeCompare(b))
  const pesos = ids.map((id) => partes[id] ?? 0)
  if (!pesos.some((p) => p > 0)) return null
  return filasDeReparto(ids, pesos, repartirPorPesos(total, pesos))
}
