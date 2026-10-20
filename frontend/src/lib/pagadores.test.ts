import type { AbstractPowerSyncDatabase } from "@powersync/web"
import { beforeEach, describe, expect, it } from "vitest"

import { guardarPagadores } from "@/lib/pagadores"

// `node:sqlite` viene con Node: se pide en tiempo de ejecucion (ver lente.test.ts).
type Sqlite = typeof import("node:sqlite")
const { DatabaseSync } = (
  globalThis as unknown as { process: { getBuiltinModule(id: string): Sqlite } }
).process.getBuiltinModule("node:sqlite")

describe("quien mas puso en un gasto (0032)", () => {
  let sq: InstanceType<Sqlite["DatabaseSync"]>
  let db: AbstractPowerSyncDatabase

  beforeEach(() => {
    sq = new DatabaseSync(":memory:")
    sq.exec(
      "CREATE TABLE transaction_payers (id, transaction_id, user_id, account_id, amount, status)",
    )
    db = {
      execute: async (sql: string, params: unknown[] = []) => {
        sq.prepare(sql).run(...(params as never[]))
        return {}
      },
    } as unknown as AbstractPowerSyncDatabase
  })

  const filas = () =>
    sq
      .prepare("SELECT user_id, account_id, amount, status FROM transaction_payers ORDER BY amount")
      .all()

  it("crea a los nuevos; la conjunta nace confirmada", async () => {
    await guardarPagadores(db, "t", [
      { user_id: "b", account_id: null, amount: 6000 },
      { user_id: null, account_id: "c", amount: 1000 },
      // Cero no es un pagador.
      { user_id: "d", account_id: null, amount: 0 },
    ])
    expect(filas()).toEqual([
      { user_id: null, account_id: "c", amount: 1000, status: "confirmed" },
      { user_id: "b", account_id: null, amount: 6000, status: "pending" },
    ])
  })

  it("cambia el monto de los que siguen y saca a los que ya no estan", async () => {
    sq.prepare(
      "INSERT INTO transaction_payers VALUES ('p1', 't', 'b', NULL, 6000, 'confirmed')",
    ).run()
    sq.prepare(
      "INSERT INTO transaction_payers VALUES ('p2', 't', 'd', NULL, 2000, 'pending')",
    ).run()
    await guardarPagadores(
      db,
      "t",
      [{ user_id: "b", account_id: null, amount: 5000 }],
      [
        { id: "p1", user_id: "b", account_id: null, amount: 6000, status: "confirmed" },
        { id: "p2", user_id: "d", account_id: null, amount: 2000, status: "pending" },
      ],
    )
    // El estado lo vuelve a poner el servidor (pide confirmar de nuevo, Q1).
    expect(filas()).toEqual([{ user_id: "b", account_id: null, amount: 5000, status: "confirmed" }])
  })
})
