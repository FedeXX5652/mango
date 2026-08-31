// Mecanica de presupuesto por sobres (ver ESPECIFICACION 3.6 y decision 0004).
//
// Un sobre es una categoria. Cada mes:
//   saldo   = arrastre + asignado - gastado
//   arrastre(mes+1) = rollover ? saldo : min(0, saldo)
// (rollover acumula; sin rollover el sobrante positivo vuelve a "por asignar",
//  el negativo arrastra en rojo).
//
// Consumo por CATEGORIA EXACTA: cada movimiento consume del sobre de su
// categoria y de ninguno mas. Un padre es hoja y grupo a la vez: el encabezado
// del grupo suma padre e hijas pero es informativo, no un sobre.
//
// por_asignar = fondos presupuestables - suma de saldos de los sobres.

export interface EntradaSobre {
  categoryId: string
  rollover: boolean
}

export interface DatosSobres {
  sobres: EntradaSobre[]
  // Clave `${categoryId}|${YYYY-MM}` -> monto asignado explicito (fila de budgets).
  asignado: Map<string, number>
  // Clave `${categoryId}|${YYYY-MM}` -> gastado (categoria exacta) ese mes.
  gastado: Map<string, number>
  // Fondos de cuentas presupuestables (off_budget=false) al fin del mes elegido.
  fondos: number
  // Meses en orden (YYYY-MM) desde el primero con datos hasta el elegido, inclusive.
  meses: string[]
}

export interface SaldoSobre {
  categoryId: string
  assigned: number
  spent: number
  carry: number
  balance: number
}

export interface ResultadoMes {
  sobres: SaldoSobre[]
  porAsignar: number
}

function asignadoDe(env: EntradaSobre, mes: string, asignado: Map<string, number>): number {
  // Sin fila explicita ese mes, el sobre no tiene asignacion (0). La asignacion
  // recurrente la crea el sistema de recurrentes como una fila real.
  return asignado.get(`${env.categoryId}|${mes}`) ?? 0
}

function replay(env: EntradaSobre, d: DatosSobres): SaldoSobre {
  let carry = 0
  let ultimo: SaldoSobre = {
    categoryId: env.categoryId,
    assigned: 0,
    spent: 0,
    carry: 0,
    balance: 0,
  }
  for (const mes of d.meses) {
    const assigned = asignadoDe(env, mes, d.asignado)
    const spent = d.gastado.get(`${env.categoryId}|${mes}`) ?? 0
    const balance = carry + assigned - spent
    ultimo = { categoryId: env.categoryId, assigned, spent, carry, balance }
    carry = env.rollover ? balance : Math.min(0, balance)
  }
  return ultimo // el ultimo mes es el elegido
}

export function calcularMes(d: DatosSobres): ResultadoMes {
  const sobres = d.sobres.map((env) => replay(env, d))
  const porAsignar = d.fondos - sobres.reduce((s, e) => s + e.balance, 0)
  return { sobres, porAsignar }
}
