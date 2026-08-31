import { describe, expect, it } from "vitest"

import { ordenarJerarquico } from "./categorias"

const cats = [
  { id: "h-super", name: "Supermercado", parent_id: "p-comida" },
  { id: "p-ocio", name: "Ocio", parent_id: null },
  { id: "p-comida", name: "Comida", parent_id: null },
  { id: "h-resto", name: "Restaurante", parent_id: "p-comida" },
  { id: "h-cine", name: "Cine", parent_id: "p-ocio" },
]

describe("ordenarJerarquico", () => {
  it("ordena por padre (alfabetico) y luego hijas bajo su padre", () => {
    const orden = ordenarJerarquico(cats).map((c) => c.id)
    expect(orden).toEqual(["p-comida", "h-resto", "h-super", "p-ocio", "h-cine"])
  })

  it("con `incluir` filtra pero conserva la posicion bajo el padre", () => {
    // El padre no esta incluido, pero sus hijas quedan agrupadas en su lugar.
    const incluir = new Set(["h-resto", "h-super", "p-ocio"])
    const orden = ordenarJerarquico(cats, incluir).map((c) => c.id)
    expect(orden).toEqual(["h-resto", "h-super", "p-ocio"])
  })

  it("pone las huerfanas (padre ausente) al final", () => {
    const conHuerfana = [...cats, { id: "h-suelta", name: "Suelta", parent_id: "no-existe" }]
    const orden = ordenarJerarquico(conHuerfana).map((c) => c.id)
    expect(orden[orden.length - 1]).toBe("h-suelta")
  })
})
