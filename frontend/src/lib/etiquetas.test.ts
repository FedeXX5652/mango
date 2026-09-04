import { describe, expect, it } from "vitest"

import { agruparPorEtiqueta } from "@/lib/etiquetas"
import { SIN_COLOR } from "@/lib/paleta"

const etiquetas = [
  { id: "a", name: "Viaje", color: "#DC2626", archived: 0 },
  { id: "b", name: "Refacción", color: "#2563EB", archived: 0 },
  { id: "c", name: "Mudanza 2024", color: null, archived: 1 },
]

describe("agruparPorEtiqueta", () => {
  it("ordena de mayor a menor gasto", () => {
    const r = agruparPorEtiqueta(
      [
        { id: "b", total: 5000, n: 1 },
        { id: "a", total: 120000, n: 4 },
        { id: "c", total: 30000, n: 2 },
      ],
      etiquetas,
    )
    expect(r.map((x) => x.name)).toEqual(["Viaje", "Mudanza 2024", "Refacción"])
    expect(r[0].total).toBe(120000)
    expect(r[0].n).toBe(4)
  })

  it("incluye las archivadas y las marca", () => {
    const r = agruparPorEtiqueta([{ id: "c", total: 30000, n: 2 }], etiquetas)
    expect(r).toHaveLength(1)
    expect(r[0].archived).toBe(true)
  })

  it("descarta una fila cuya etiqueta no existe", () => {
    const r = agruparPorEtiqueta(
      [
        { id: "fantasma", total: 999900, n: 9 },
        { id: "a", total: 100, n: 1 },
      ],
      etiquetas,
    )
    expect(r.map((x) => x.id)).toEqual(["a"])
  })

  it("usa el color neutro cuando la etiqueta no tiene color", () => {
    const r = agruparPorEtiqueta([{ id: "c", total: 1, n: 1 }], etiquetas)
    expect(r[0].color).toBe(SIN_COLOR)
  })

  it("desempata por nombre", () => {
    const r = agruparPorEtiqueta(
      [
        { id: "b", total: 7000, n: 1 },
        { id: "a", total: 7000, n: 1 },
      ],
      etiquetas,
    )
    expect(r.map((x) => x.name)).toEqual(["Refacción", "Viaje"])
  })

  it("sin filas devuelve vacio", () => {
    expect(agruparPorEtiqueta([], etiquetas)).toEqual([])
  })
})
