// El resumen de cada dia en las listas de movimientos (1.12.0): a la derecha de
// la fecha, como vamos ese dia. Centavos enteros (regla 1) y una moneda por
// total: nunca se mezclan ni se convierten (3.6.1).

export interface TotalDia {
  moneda: string
  // Ingresos menos gastos: positivo si entro mas de lo que salio.
  neto: number
}

// Primero la moneda base, despues el resto por nombre.
function ordenar(m: Map<string, number>, base: string): TotalDia[] {
  return [...m.entries()]
    .map(([moneda, neto]) => ({ moneda, neto }))
    .sort((a, b) =>
      a.moneda === base ? -1 : b.moneda === base ? 1 : a.moneda.localeCompare(b.moneda),
    )
}

/** Lo personal de un dia: ingresos menos gastos, por moneda. Las transferencias
 *  no cuentan (mueven plata entre cuentas propias) ni lo que no esta confirmado
 *  (un cobro o un pago que todavia no se acepto). Un dia solo con transferencias
 *  no tiene total. */
export function netoDelDia(
  filas: { kind: string; amount: number; currency: string; status: string }[],
  base: string,
): TotalDia[] {
  const m = new Map<string, number>()
  for (const f of filas) {
    if (f.status !== "confirmed" || f.kind === "transfer") continue
    const signo = f.kind === "income" ? 1 : -1
    m.set(f.currency, (m.get(f.currency) ?? 0) + signo * f.amount)
  }
  return ordenar(m, base)
}

/** Lo que gasto el grupo en el dia, por moneda (en negativo, como un gasto). Los
 *  pagos entre miembros y los aportes a la conjunta no son gasto del grupo. */
export function gastoDelDia(
  items: { tipo: string; amount: number; currency: string }[],
  base: string,
): TotalDia[] {
  const m = new Map<string, number>()
  for (const it of items) {
    if (it.tipo !== "gasto") continue
    m.set(it.currency, (m.get(it.currency) ?? 0) - it.amount)
  }
  return ordenar(m, base)
}
