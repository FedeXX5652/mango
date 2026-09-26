// Resumen de un grupo (fase 3b.3): cuanto gasto el grupo, en que, quien puso, y
// el balance en partes iguales con la sugerencia de quien le paga a quien.
//
// Todo en centavos (enteros), como el resto de la app (regla 1). El reparto es
// **en partes iguales** entre los miembros: es el default de Splitwise y lo que
// pidio el usuario como MVP. Splits desiguales por gasto y el registro de pagos
// (para que un balance se salde) son trabajo posterior: necesitan esquema.
//
// Multi-moneda: no se mezclan monedas (no hay una cotizacion del grupo). Se
// arma un resumen por cada moneda que aparezca en los gastos compartidos.

export interface TxGrupo {
  id: string
  owner_id: string
  amount: number
  currency: string
  category_id: string | null
  kind: string
  // Pagado desde la cuenta conjunta (0016): suma al total del grupo pero no
  // genera deuda entre personas (nadie puso de lo suyo). 1/true = conjunta.
  paid_from_group?: number | boolean
}

export interface MiembroGrupo {
  user_id: string
  nombre: string
}

// Parte de un gasto compartido (reparto desigual, 0015). Si un gasto tiene
// splits, la parte de cada uno sale de aca; si no, se reparte en partes iguales.
export interface SplitRow {
  transaction_id: string
  user_id: string
  amount: number
}

// Pago entre miembros para saldar (0015). Ajusta el balance, no los saldos.
export interface SettlementRow {
  from_user_id: string
  to_user_id: string
  amount: number
  currency: string
}

export interface Liquidacion {
  de: string // user_id que paga
  a: string // user_id que cobra
  monto: number
}

export interface BalanceMiembro {
  user_id: string
  nombre: string
  puso: number // lo que pago de su bolsillo
  parte: number // lo que le tocaba (total / N)
  neto: number // puso - parte (positivo: le deben; negativo: debe)
}

export interface ResumenMoneda {
  currency: string
  total: number
  porCategoria: { category_id: string | null; total: number }[]
  porMiembro: { user_id: string; nombre: string; total: number }[]
  balances: BalanceMiembro[]
  liquidaciones: Liquidacion[]
}

// Reparte `total` en `n` partes enteras que suman exactamente `total`: el resto
// de la division se distribuye de a un centavo entre las primeras partes. Asi el
// balance cierra en cero y no se pierde ni se inventa un centavo.
function partesIguales(total: number, n: number): number[] {
  if (n <= 0) return []
  const base = Math.floor(total / n)
  const resto = total - base * n
  return Array.from({ length: n }, (_, i) => base + (i < resto ? 1 : 0))
}

// Minimiza los pagos para saldar: se emparejan el que mas debe con el que mas le
// deben, hasta cero. No busca el optimo teorico (es NP), pero da pocos pagos y
// siempre correctos. Trabaja sobre copias de los netos en centavos.
function liquidar(balances: BalanceMiembro[]): Liquidacion[] {
  const deudores = balances
    .filter((b) => b.neto < 0)
    .map((b) => ({ id: b.user_id, monto: -b.neto }))
    .sort((a, b) => b.monto - a.monto)
  const acreedores = balances
    .filter((b) => b.neto > 0)
    .map((b) => ({ id: b.user_id, monto: b.neto }))
    .sort((a, b) => b.monto - a.monto)

  const pagos: Liquidacion[] = []
  let i = 0
  let j = 0
  while (i < deudores.length && j < acreedores.length) {
    const monto = Math.min(deudores[i].monto, acreedores[j].monto)
    if (monto > 0) pagos.push({ de: deudores[i].id, a: acreedores[j].id, monto })
    deudores[i].monto -= monto
    acreedores[j].monto -= monto
    if (deudores[i].monto === 0) i++
    if (acreedores[j].monto === 0) j++
  }
  return pagos
}

// Nombre de un miembro; si no esta (dejo el grupo pero tiene gastos), un fallback
// con los primeros caracteres del id para no romper.
function nombreDe(miembros: MiembroGrupo[], userId: string): string {
  return miembros.find((m) => m.user_id === userId)?.nombre ?? userId.slice(0, 8)
}

export function resumenGrupo(
  txs: TxGrupo[],
  miembros: MiembroGrupo[],
  extra: { splits?: SplitRow[]; settlements?: SettlementRow[] } = {},
): ResumenMoneda[] {
  const { splits = [], settlements = [] } = extra
  // Solo gastos: "cuanto gasto el grupo" y quien puso plata (regla del payador).
  const gastos = txs.filter((t) => t.kind === "expense")
  const monedas = [...new Set(gastos.map((t) => t.currency))].sort()

  // Splits por gasto, para calcular la parte de cada uno (0015).
  const splitsPorTx = new Map<string, SplitRow[]>()
  for (const s of splits) {
    const arr = splitsPorTx.get(s.transaction_id)
    if (arr) arr.push(s)
    else splitsPorTx.set(s.transaction_id, [s])
  }

  const ordenados = [...miembros].sort((a, b) => a.user_id.localeCompare(b.user_id))

  return monedas.map((currency) => {
    const delaMoneda = gastos.filter((t) => t.currency === currency)
    const total = delaMoneda.reduce((s, t) => s + t.amount, 0)

    // Por categoria, mayor primero.
    const catMap = new Map<string | null, number>()
    for (const t of delaMoneda) catMap.set(t.category_id, (catMap.get(t.category_id) ?? 0) + t.amount)
    const porCategoria = [...catMap.entries()]
      .map(([category_id, total]) => ({ category_id, total }))
      .sort((a, b) => b.total - a.total)

    // El balance solo mira lo pagado con cuentas PERSONALES: lo de la cuenta
    // conjunta ya es plata de todos, no genera deuda (0016).
    const conDeuda = delaMoneda.filter((t) => !t.paid_from_group)

    // Cuanto puso cada miembro de lo suyo (0 si no puso nada este periodo).
    const puestoPor = new Map<string, number>()
    for (const t of conDeuda) puestoPor.set(t.owner_id, (puestoPor.get(t.owner_id) ?? 0) + t.amount)

    // La parte de cada uno, gasto por gasto: si el gasto tiene splits, sale de
    // ahi; si no, se reparte en partes iguales entre todos los miembros.
    const parteDe = new Map<string, number>()
    const sumar = (userId: string, monto: number) =>
      parteDe.set(userId, (parteDe.get(userId) ?? 0) + monto)
    for (const t of conDeuda) {
      const s = splitsPorTx.get(t.id)
      if (s && s.length > 0) {
        for (const split of s) sumar(split.user_id, split.amount)
      } else {
        const partes = partesIguales(t.amount, ordenados.length)
        ordenados.forEach((m, idx) => sumar(m.user_id, partes[idx] ?? 0))
      }
    }

    const balances: BalanceMiembro[] = ordenados.map((m) => {
      const puso = puestoPor.get(m.user_id) ?? 0
      const parte = parteDe.get(m.user_id) ?? 0
      return { user_id: m.user_id, nombre: m.nombre, puso, parte, neto: puso - parte }
    })

    // Los pagos ya hechos ajustan el balance: quien pago debe menos, quien cobro
    // recibio parte de lo suyo. Asi un saldo que ya se pago desaparece (0015).
    const netoDe = new Map(balances.map((b) => [b.user_id, b.neto]))
    for (const p of settlements.filter((x) => x.currency === currency)) {
      if (netoDe.has(p.from_user_id)) netoDe.set(p.from_user_id, netoDe.get(p.from_user_id)! + p.amount)
      if (netoDe.has(p.to_user_id)) netoDe.set(p.to_user_id, netoDe.get(p.to_user_id)! - p.amount)
    }
    for (const b of balances) b.neto = netoDe.get(b.user_id) ?? b.neto

    const porMiembro = [...puestoPor.entries()]
      .map(([user_id, total]) => ({ user_id, nombre: nombreDe(miembros, user_id), total }))
      .sort((a, b) => b.total - a.total)

    return { currency, total, porCategoria, porMiembro, balances, liquidaciones: liquidar(balances) }
  })
}
