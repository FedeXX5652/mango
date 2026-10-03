import { describe, expect, it } from "vitest"

import { debeRecargar } from "@/lib/actualizacion"

describe("cuando entra una version nueva", () => {
  it("sin version esperando, nunca", () => {
    expect(debeRecargar({ pendiente: false, oculta: true, bloqueada: true })).toBe(false)
  })
  it("con la app oculta o en el PIN, si: no se pierde nada", () => {
    expect(debeRecargar({ pendiente: true, oculta: true, bloqueada: false })).toBe(true)
    expect(debeRecargar({ pendiente: true, oculta: false, bloqueada: true })).toBe(true)
  })
  it("desbloqueada y a la vista, no: puede haber un alta a medio cargar", () => {
    expect(debeRecargar({ pendiente: true, oculta: false, bloqueada: false })).toBe(false)
  })
})
