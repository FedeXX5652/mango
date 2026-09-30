import { UpdateType } from "@powersync/web"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// La sesion se simula: el conector debe mandar el token que haya.
const sesion = vi.hoisted(() => ({ token: "tok-123" as string | null, borrado: false }))
vi.mock("@/lib/sesion", () => ({
  tokenActual: () => sesion.token,
  borrarToken: () => {
    sesion.borrado = true
  },
}))
vi.mock("@/lib/rechazados", () => ({ registrarRechazo: vi.fn() }))

import { subir } from "@/lib/powersync/conector"

const respuesta = (status: number, cuerpo: unknown = {}) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { "Content-Type": "application/json" } })

describe("subir: autenticacion de las escrituras", () => {
  let fetchMock: ReturnType<typeof vi.fn>
  beforeEach(() => {
    sesion.token = "tok-123"
    sesion.borrado = false
    fetchMock = vi.fn(async () => respuesta(201))
    vi.stubGlobal("fetch", fetchMock)
  })
  afterEach(() => vi.unstubAllGlobals())

  const headersDe = (i = 0) =>
    (fetchMock.mock.calls[i][1] as RequestInit).headers as Record<string, string>

  it("alta, modificacion y baja llevan el Bearer de la sesion", async () => {
    // Regresion: el conector subia SIN token y la API (3a) devolvia 401 a todo.
    await subir({ tabla: "transactions", op: UpdateType.PUT, id: "a", datos: { amount: 1 } })
    await subir({ tabla: "transactions", op: UpdateType.PATCH, id: "a", datos: { amount: 2 } })
    await subir({ tabla: "transactions", op: UpdateType.DELETE, id: "a", datos: {} })
    for (const i of [0, 1, 2]) expect(headersDe(i).Authorization).toBe("Bearer tok-123")
    expect(headersDe(0)["Content-Type"]).toBe("application/json")
  })

  it("el recurso anidado de medios tambien lleva el token", async () => {
    await subir({
      tabla: "payment_method_accounts",
      op: UpdateType.PUT,
      id: "x",
      datos: { payment_method_id: "pm", currency: "ARS", account_id: "acc" },
    })
    expect(headersDe().Authorization).toBe("Bearer tok-123")
  })

  it("un 401 NO descarta el cambio: borra la sesion y relanza para reintentar", async () => {
    fetchMock.mockResolvedValueOnce(respuesta(401, { detail: "No autenticado" }))
    await expect(
      subir({ tabla: "transactions", op: UpdateType.PUT, id: "a", datos: {} }),
    ).rejects.toThrow()
    expect(sesion.borrado).toBe(true)
  })

  it("un 422 de dominio sigue siendo un rechazo con su motivo", async () => {
    fetchMock.mockResolvedValueOnce(respuesta(422, { detail: "La cuenta no existe" }))
    const r = await subir({ tabla: "transactions", op: UpdateType.PUT, id: "a", datos: {} })
    expect(r).toEqual({ ok: false, motivo: "La cuenta no existe" })
  })
})
