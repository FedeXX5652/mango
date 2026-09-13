import type { AbstractPowerSyncDatabase } from "@powersync/web"

import { fechaISO } from "@/lib/fecha"
import {
  type ReglaRecurrente,
  type ReglaSobre,
  inicioDeMes,
  ocurrenciasPendientes,
  sobresPendientes,
} from "@/lib/recurrentes"

// Corre las recurrentes vencidas **contra la base local**. Sin red, sin
// esperar a nadie: abrís la app en el avión y el alquiler del día 1 ya está.
//
// La cuenta de qué venció vive en `recurrentes.ts`, que es puro y esta probado.
// Acá solo se lee, se arma y se escribe, todo en UNA transaccion: o entran el
// movimiento y el avance de `next_run_date` juntos, o no entra ninguno. Si se
// escribieran por separado y fallara la segunda, la proxima corrida volveria a
// generar lo mismo.

export interface Generado {
  movimientos: number
  sobres: number
}

const SQL_REGLAS = `
  SELECT id, kind, account_id, transfer_account_id, category_id, payment_method_id,
         amount, currency, payee, notes, frequency, interval_count,
         next_run_date, end_date, active
  FROM recurring_rules
  WHERE deleted_at IS NULL AND active = 1 AND next_run_date <= ?`

const SQL_REGLAS_SOBRE = `
  SELECT id, category_id, amount, currency, active
  FROM budget_rules WHERE deleted_at IS NULL AND active = 1`

// Los sobres que ya tiene el mes, sea de una corrida anterior o cargados a mano.
const SQL_SOBRES_DEL_MES = `
  SELECT category_id, currency FROM budgets
  WHERE deleted_at IS NULL AND period_start = ?`

export async function generarVencidas(
  db: AbstractPowerSyncDatabase,
  hoy: string = fechaISO(new Date()),
): Promise<Generado> {
  const reglas = await db.getAll<ReglaRecurrente>(SQL_REGLAS, [hoy])
  const reglasSobre = await db.getAll<ReglaSobre>(SQL_REGLAS_SOBRE)
  const yaEstan = await db.getAll<{ category_id: string; currency: string }>(SQL_SOBRES_DEL_MES, [
    inicioDeMes(hoy),
  ])

  const existentes = new Set(yaEstan.map((b) => `${b.category_id}|${b.currency}`))
  const sobres = sobresPendientes(reglasSobre, hoy, existentes)
  const pendientes = reglas.map((r) => ({ regla: r, ...ocurrenciasPendientes(r, hoy) }))
  const candidatos = pendientes.flatMap((p) => p.ocurrencias)

  // El id es determinista, asi que una ocurrencia que ya se genero choca contra
  // la clave primaria y voltea la transaccion entera. Pasa si `next_run_date`
  // retrocede, que es lo que ocurre al editarle la fecha a una regla vieja.
  const yaGenerados = await idsExistentes(
    db,
    candidatos.map((o) => o.id),
  )
  const movimientos = candidatos.filter((o) => !yaGenerados.has(o.id))

  if (movimientos.length === 0 && sobres.length === 0) {
    return { movimientos: 0, sobres: 0 }
  }

  await db.writeTransaction(async (tx) => {
    for (const o of movimientos) {
      const r = o.regla
      await tx.execute(
        `INSERT INTO transactions
           (id, kind, occurred_at, amount, currency, account_id, transfer_account_id,
            category_id, payment_method_id, payee, notes, source)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'recurring')`,
        [
          o.id,
          r.kind,
          o.occurred_at,
          r.amount,
          r.currency,
          r.account_id,
          r.kind === "transfer" ? r.transfer_account_id : null,
          r.kind === "transfer" ? null : r.category_id,
          r.payment_method_id,
          r.payee,
          r.notes,
        ],
      )
    }
    for (const p of pendientes) {
      if (p.ocurrencias.length === 0) continue
      await tx.execute("UPDATE recurring_rules SET next_run_date = ? WHERE id = ?", [
        p.proxima,
        p.regla.id,
      ])
    }
    for (const s of sobres) {
      await tx.execute(
        `INSERT INTO budgets (id, category_id, period_start, amount, currency)
         VALUES (?, ?, ?, ?, ?)`,
        [s.id, s.category_id, s.period_start, s.amount, s.currency],
      )
    }
  })

  return { movimientos: movimientos.length, sobres: sobres.length }
}

// Cuales de esos ids ya estan en la base. En bloques, porque SQLite tiene un
// tope de parametros por consulta y una regla diaria abandonada un año son 365.
async function idsExistentes(db: AbstractPowerSyncDatabase, ids: string[]): Promise<Set<string>> {
  const encontrados = new Set<string>()
  for (let i = 0; i < ids.length; i += 200) {
    const bloque = ids.slice(i, i + 200)
    const filas = await db.getAll<{ id: string }>(
      `SELECT id FROM transactions WHERE id IN (${bloque.map(() => "?").join(",")})`,
      bloque,
    )
    for (const f of filas) encontrados.add(f.id)
  }
  return encontrados
}
