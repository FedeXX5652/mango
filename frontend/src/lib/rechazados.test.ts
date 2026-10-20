import type { AbstractPowerSyncDatabase } from "@powersync/web"
import { beforeEach, describe, expect, it, vi } from "vitest"

const subir = vi.hoisted(() => vi.fn())
vi.mock("@/lib/powersync/conector", () => ({ subir }))

import { campoDelMotivo, editarRechazada, reintentar, restaurarOriginal } from "@/lib/rechazados"

// `node:sqlite` viene con Node: se pide en tiempo de ejecucion (ver lente.test.ts).
type Sqlite = typeof import("node:sqlite")
const { DatabaseSync } = (
  globalThis as unknown as { process: { getBuiltinModule(id: string): Sqlite } }
).process.getBuiltinModule("node:sqlite")

describe("la bandeja de rechazados (1.7.0)", () => {
  let sq: InstanceType<Sqlite["DatabaseSync"]>
  let db: AbstractPowerSyncDatabase

  beforeEach(() => {
    subir.mockReset()
    sq = new DatabaseSync(":memory:")
    sq.exec(`CREATE TABLE subidas_rechazadas (id, tabla, op, fila_id, datos, datos_original,
             motivo, rechazada_en)`)
    const api = {
      execute: async (sql: string, params: unknown[] = []) => {
        sq.prepare(sql).run(...(params as never[]))
        return {}
      },
      getAll: async (sql: string, params: unknown[] = []) =>
        sq.prepare(sql).all(...(params as never[])),
    }
    db = api as unknown as AbstractPowerSyncDatabase
  })

  const alta = (id: string, op: string, fila: string, cuando: string, datos = "{}") =>
    sq
      .prepare("INSERT INTO subidas_rechazadas VALUES (?, 'transactions', ?, ?, ?, NULL, 'x', ?)")
      .run(id, op, fila, datos, cuando)

  it("reintenta en el orden en que se rechazaron, no en el de la pantalla", async () => {
    alta("b", "PATCH", "t1", "2026-10-12T10:05:00Z")
    alta("a", "PUT", "t1", "2026-10-12T10:00:00Z")
    subir.mockResolvedValue({ ok: true })
    // La pantalla pasa lo ultimo primero.
    const r = await reintentar(db, ["b", "a"])
    expect(subir.mock.calls.map((c) => c[0].op)).toEqual(["PUT", "PATCH"])
    expect(r).toEqual({ reintentadas: 2, fallidas: 0 })
    expect(sq.prepare("SELECT count(*) AS n FROM subidas_rechazadas").get()).toEqual({ n: 0 })
  })

  it("si vuelve a fallar cambia el motivo, no la fecha", async () => {
    alta("a", "PUT", "t1", "2026-10-12T10:00:00Z")
    subir.mockResolvedValue({ ok: false, motivo: "amount: debe ser mayor a 0" })
    await reintentar(db, ["a"])
    expect(sq.prepare("SELECT motivo, rechazada_en FROM subidas_rechazadas").get()).toEqual({
      motivo: "amount: debe ser mayor a 0",
      rechazada_en: "2026-10-12T10:00:00Z",
    })
  })

  it("editar guarda el original la primera vez; restaurar vuelve a el", async () => {
    alta("a", "PUT", "t1", "2026-10-12T10:00:00Z", JSON.stringify({ amount: -5 }))
    await editarRechazada(db, "a", { amount: 5 })
    await editarRechazada(db, "a", { amount: 7 })
    const fila = () =>
      sq.prepare("SELECT datos, datos_original FROM subidas_rechazadas").get() as {
        datos: string
        datos_original: string | null
      }
    expect(JSON.parse(fila().datos)).toEqual({ amount: 7 })
    expect(JSON.parse(fila().datos_original ?? "null")).toEqual({ amount: -5 })
    await restaurarOriginal(db, "a")
    expect(JSON.parse(fila().datos)).toEqual({ amount: -5 })
    expect(fila().datos_original).toBeNull()
  })

  it("el campo que nombra el motivo", () => {
    expect(campoDelMotivo("amount: debe ser mayor a 0", { amount: 1 })).toBe("amount")
    expect(campoDelMotivo("La cuenta no existe", { account_id: "x" })).toBeNull()
  })
})
