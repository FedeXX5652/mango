import type { AbstractPowerSyncDatabase } from "@powersync/web"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { generarVencidas } from "@/lib/generar"

vi.mock("@/lib/sesion", () => ({ usuarioActualId: () => "yo" }))

// `node:sqlite` viene con Node: se pide en tiempo de ejecucion (ver lente.test.ts).
type Sqlite = typeof import("node:sqlite")
const { DatabaseSync } = (
  globalThis as unknown as { process: { getBuiltinModule(id: string): Sqlite } }
).process.getBuiltinModule("node:sqlite")

// Recurrentes de un grupo (1.15.0): las genera solo quien las creo, y el gasto
// va al grupo con su reparto.
describe("generar recurrentes vencidas", () => {
  let sq: InstanceType<Sqlite["DatabaseSync"]>
  let db: AbstractPowerSyncDatabase

  beforeEach(() => {
    sq = new DatabaseSync(":memory:")
    sq.exec(`
      CREATE TABLE recurring_rules (id, owner_id, group_id, name, kind, account_id,
        transfer_account_id, category_id, amount, currency, payee, notes, frequency,
        interval_count, start_date, next_run_date, end_date, active, deleted_at);
      CREATE TABLE transactions (id, owner_id, kind, occurred_at, amount, currency, account_id,
        transfer_account_id, category_id, payee, notes, visibility, group_id, paid_from_group,
        source, status);
      CREATE TABLE accounts (id, group_id);
      INSERT INTO accounts VALUES ('cta', NULL), ('conjunta', 'g');
      CREATE TABLE transaction_splits (id, transaction_id, user_id, amount);
      CREATE TABLE budget_rules (id, category_id, amount, currency, active, deleted_at);
      CREATE TABLE budgets (id, category_id, period_start, amount, currency, deleted_at);
      CREATE TABLE groups (id, default_split, deleted_at);
      CREATE TABLE group_members (group_id, user_id, deleted_at);
      INSERT INTO groups VALUES ('g', '{"yo": 3, "otra": 2}', NULL);
      INSERT INTO group_members VALUES ('g', 'yo', NULL), ('g', 'otra', NULL);
    `)
    const correr = (sql: string, params: unknown[] = []) => {
      sq.prepare(sql).run(...(params as never[]))
      return {}
    }
    db = {
      getAll: async (sql: string, params: unknown[] = []) =>
        sq.prepare(sql).all(...(params as never[])),
      execute: async (sql: string, params: unknown[] = []) => correr(sql, params),
      writeTransaction: async (fn: (tx: unknown) => Promise<void>) =>
        fn({ execute: async (sql: string, params: unknown[] = []) => correr(sql, params) }),
    } as unknown as AbstractPowerSyncDatabase
  })

  const regla = (id: string, owner: string | null, grupo: string | null, cuenta = "cta") =>
    sq
      .prepare(
        `INSERT INTO recurring_rules VALUES (?, ?, ?, 'Alquiler', 'expense', ?, NULL, 'cat',
          1001, 'ARS', NULL, NULL, 'monthly', 1, '2026-11-01', '2026-11-01', NULL, 1, NULL)`,
      )
      .run(id, owner, grupo, cuenta)

  it("la del grupo va al grupo, con su reparto", async () => {
    regla("r1", "yo", "g")
    const r = await generarVencidas(db, "2026-11-03")
    expect(r.movimientos).toBe(1)
    expect(
      sq.prepare("SELECT visibility, group_id, paid_from_group FROM transactions").all(),
    ).toEqual([{ visibility: "shared", group_id: "g", paid_from_group: 0 }])
    expect(
      sq.prepare("SELECT user_id, amount FROM transaction_splits ORDER BY user_id").all(),
    ).toEqual([
      { user_id: "otra", amount: 400 },
      { user_id: "yo", amount: 601 },
    ])
  })

  it("pagada con la conjunta no genera deuda, ya sin conexion", async () => {
    regla("r4", "yo", "g", "conjunta")
    await generarVencidas(db, "2026-11-03")
    expect(sq.prepare("SELECT paid_from_group FROM transactions").get()).toEqual({
      paid_from_group: 1,
    })
  })

  it("la de otro miembro no la genera este dispositivo", async () => {
    regla("r2", "otra", "g")
    expect((await generarVencidas(db, "2026-11-03")).movimientos).toBe(0)
    expect(sq.prepare("SELECT count(*) AS n FROM transactions").get()).toEqual({ n: 0 })
  })

  it("una personal recien creada (sin dueño todavia) se genera, sin reparto", async () => {
    regla("r3", null, null)
    expect((await generarVencidas(db, "2026-11-03")).movimientos).toBe(1)
    expect(sq.prepare("SELECT visibility, group_id FROM transactions").all()).toEqual([
      { visibility: "private", group_id: null },
    ])
    expect(sq.prepare("SELECT count(*) AS n FROM transaction_splits").get()).toEqual({ n: 0 })
  })
})
