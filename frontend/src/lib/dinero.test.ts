import { describe, expect, it } from "vitest"

import { aCentavos, formatearCentavos, formatearMonto } from "./dinero"

describe("formatearCentavos", () => {
  it("separa miles y dos decimales", () => {
    expect(formatearCentavos(230272)).toBe("2.302,72")
  })
  it("montos chicos con cero a la izquierda en decimales", () => {
    expect(formatearCentavos(5)).toBe("0,05")
  })
  it("no pierde precision en montos grandes", () => {
    expect(formatearCentavos(9_000_000_000_000_000)).toBe("90.000.000.000.000,00")
  })
})

describe("formatearMonto", () => {
  it("gasto lleva signo menos", () => {
    expect(formatearMonto(230272, { direccion: "gasto" })).toBe("-$ 2.302,72")
  })
  it("ingreso lleva signo mas", () => {
    expect(formatearMonto(150000, { direccion: "ingreso" })).toBe("+$ 1.500,00")
  })
  it("otra moneda antepone el codigo", () => {
    expect(formatearMonto(1000, { moneda: "USD" })).toBe("USD 10,00")
  })
})

describe("aCentavos", () => {
  it("acepta coma decimal (formato local)", () => {
    expect(aCentavos("2.302,72")).toBe(230272)
  })
  it("acepta punto decimal", () => {
    expect(aCentavos("15.80")).toBe(1580)
  })
  it("rechaza texto no numerico", () => {
    expect(aCentavos("abc")).toBeNull()
  })
})
