import { beforeEach, describe, expect, it } from "vitest"

import { TX_GRUPO } from "@/lib/lente"
import { saldoCuenta } from "@/lib/saldos"

// El SQL del lente y del saldo corre en el SQLite del dispositivo. Aca se prueba
// contra un SQLite de verdad, con las tablas locales como las deja la sync
// (0021): lo mio completo en `transactions`, el lente del grupo en
// `group_transactions`, los pagos en `settlements` y lo privado de mis pagos en
// `settlement_accounts`.

// `node:sqlite` viene con Node (22.13+/24). Se pide en tiempo de ejecucion: el
// Vite de vitest no lo tiene en su lista de modulos de Node y, con un import
// estatico, lo intenta resolver como un paquete "sqlite" que no existe.
type Sqlite = typeof import("node:sqlite")
const { DatabaseSync } = (
  globalThis as unknown as { process: { getBuiltinModule(id: string): Sqlite } }
).process.getBuiltinModule("node:sqlite")
type DatabaseSync = InstanceType<Sqlite["DatabaseSync"]>

const YO = "yo"
const BETO = "beto"
const CASA = "casa"
const EFECTIVO = "efectivo"
const CONJUNTA = "conjunta"

let db: DatabaseSync

const COLS_TX =
  "id, owner_id, group_id, visibility, kind, status, occurred_at, category_id, amount," +
  " currency, payee, paid_from_group, account_id, amount_account, transfer_account_id, deleted_at"

beforeEach(() => {
  db = new DatabaseSync(":memory:")
  db.exec(`
    CREATE TABLE transactions (${COLS_TX}, payment_method_id, notes);
    CREATE TABLE group_transactions (${COLS_TX});
    CREATE TABLE accounts (id, owner_id, group_id, opening_balance, deleted_at);
    CREATE TABLE settlements (id, group_id, from_user_id, to_user_id, amount, currency, occurred_at,
                              account_id, pago_real, deleted_at);
    CREATE TABLE settlement_accounts (id, account_id, payment_method_id, deleted_at);
  `)
  db.prepare("INSERT INTO accounts VALUES (?, ?, ?, ?, NULL)").run(EFECTIVO, YO, null, 100000)
  db.prepare("INSERT INTO accounts VALUES (?, ?, ?, ?, NULL)").run(CONJUNTA, null, CASA, 0)
})

interface Tx {
  id: string
  owner_id: string
  kind?: string
  amount: number
  group_id?: string | null
  visibility?: string
  paid_from_group?: number
  account_id?: string | null
  transfer_account_id?: string | null
}

function insertar(tabla: "transactions" | "group_transactions", t: Tx) {
  db.prepare(
    `INSERT INTO ${tabla} (id, owner_id, group_id, visibility, kind, status, occurred_at, amount,
       currency, paid_from_group, account_id, transfer_account_id, deleted_at)
     VALUES (?, ?, ?, ?, ?, 'confirmed', '2026-09-20', ?, 'ARS', ?, ?, ?, NULL)`,
  ).run(
    t.id,
    t.owner_id,
    t.group_id ?? null,
    t.visibility ?? "private",
    t.kind ?? "expense",
    t.amount,
    t.paid_from_group ?? 0,
    t.account_id ?? null,
    t.transfer_account_id ?? null,
  )
}

function lenteDe(grupo: string) {
  return db
    .prepare(
      `SELECT id, owner_id, amount, account_id FROM ${TX_GRUPO} t
       WHERE t.group_id = ? AND t.visibility = 'shared' AND t.deleted_at IS NULL ORDER BY id`,
    )
    .all(grupo)
}

function saldo(cuenta: string, fuente?: string): number {
  const fila = db
    .prepare(`SELECT ${saldoCuenta(fuente)} AS balance FROM accounts a WHERE a.id = ?`)
    .get(cuenta)
  return Number(fila?.balance)
}

describe("lente del grupo (TX_GRUPO)", () => {
  it("un gasto mio compartido aparece UNA vez, con mi copia completa", () => {
    // Mi copia (por `mio`) con la cuenta; la del grupo, recortada.
    const mio = { id: "t1", owner_id: YO, amount: 1500, group_id: CASA, visibility: "shared" }
    insertar("transactions", { ...mio, account_id: EFECTIVO })
    insertar("group_transactions", mio)

    expect(lenteDe(CASA)).toEqual([{ id: "t1", owner_id: YO, amount: 1500, account_id: EFECTIVO }])
  })

  it("los gastos de los demas salen de la copia del grupo, sin cuenta", () => {
    insertar("group_transactions", {
      id: "t2",
      owner_id: BETO,
      amount: 800,
      group_id: CASA,
      visibility: "shared",
    })

    expect(lenteDe(CASA)).toEqual([{ id: "t2", owner_id: BETO, amount: 800, account_id: null }])
  })

  it("una edicion mia sin subir se ve al instante en el grupo", () => {
    // La copia del grupo todavia tiene el monto viejo; la mia, el nuevo.
    insertar("transactions", {
      id: "t3",
      owner_id: YO,
      amount: 2000,
      group_id: CASA,
      visibility: "shared",
    })
    insertar("group_transactions", {
      id: "t3",
      owner_id: YO,
      amount: 1000,
      group_id: CASA,
      visibility: "shared",
    })

    expect(lenteDe(CASA).map((f) => f.amount)).toEqual([2000])
  })

  it("lo privado no entra al lente", () => {
    insertar("transactions", { id: "t4", owner_id: YO, amount: 999, account_id: EFECTIVO })

    expect(lenteDe(CASA)).toEqual([])
  })
})

describe("saldo de una cuenta (saldoCuenta)", () => {
  it("mi cuenta: sale lo que pague yo, compartido incluido, no lo de los demas", () => {
    insertar("transactions", {
      id: "g1",
      owner_id: YO,
      amount: 3000,
      group_id: CASA,
      visibility: "shared",
      account_id: EFECTIVO,
    })
    // Lo de Beto esta en el lente, no en `transactions`: no toca mis cuentas.
    insertar("group_transactions", {
      id: "g2",
      owner_id: BETO,
      amount: 5000,
      group_id: CASA,
      visibility: "shared",
    })

    expect(saldo(EFECTIVO)).toBe(100000 - 3000)
  })

  it("un pago real mio descuenta de mi cuenta, sincronizado o no", () => {
    // Sincronizado: la cuenta llega aparte, a settlement_accounts.
    db.exec(`INSERT INTO settlements (id, from_user_id, amount, account_id, deleted_at)
             VALUES ('p1', '${YO}', 700, NULL, NULL)`)
    db.exec(`INSERT INTO settlement_accounts (id, account_id) VALUES ('p1', '${EFECTIVO}')`)
    // Sin subir: la cuenta todavia esta en la propia fila.
    db.exec(`INSERT INTO settlements (id, from_user_id, amount, account_id, deleted_at)
             VALUES ('p2', '${YO}', 300, '${EFECTIVO}', NULL)`)
    // Deshecho: no cuenta.
    db.exec(`INSERT INTO settlements (id, from_user_id, amount, account_id, deleted_at)
             VALUES ('p3', '${YO}', 5000, NULL, '2026-09-21')`)
    db.exec(`INSERT INTO settlement_accounts (id, account_id) VALUES ('p3', '${EFECTIVO}')`)
    // De Beto: sin cuenta visible, no toca la mia.
    db.exec(`INSERT INTO settlements (id, from_user_id, amount, account_id, deleted_at)
             VALUES ('p4', '${BETO}', 9000, NULL, NULL)`)

    expect(saldo(EFECTIVO)).toBe(100000 - 700 - 300)
  })

  it("la cuenta conjunta suma lo que puso y pago cada miembro (sobre el lente)", () => {
    // Yo: 20.000 adentro (mi transferencia, completa) y 18.000 pagados con ella.
    insertar("transactions", {
      id: "c1",
      owner_id: YO,
      kind: "transfer",
      amount: 20000,
      account_id: EFECTIVO,
      transfer_account_id: CONJUNTA,
    })
    insertar("transactions", {
      id: "c2",
      owner_id: YO,
      amount: 18000,
      group_id: CASA,
      visibility: "shared",
      paid_from_group: 1,
      account_id: CONJUNTA,
    })
    // Beto: 15.000 adentro (sin la cuenta de origen) y 6.000 + 2.500 pagados.
    insertar("group_transactions", {
      id: "c3",
      owner_id: BETO,
      kind: "transfer",
      amount: 15000,
      transfer_account_id: CONJUNTA,
    })
    for (const [id, monto] of [
      ["c4", 6000],
      ["c5", 2500],
    ] as const)
      insertar("group_transactions", {
        id,
        owner_id: BETO,
        amount: monto,
        group_id: CASA,
        visibility: "shared",
        paid_from_group: 1,
        account_id: CONJUNTA,
      })

    expect(saldo(CONJUNTA, TX_GRUPO)).toBe(20000 + 15000 - 18000 - 6000 - 2500)
  })
})
