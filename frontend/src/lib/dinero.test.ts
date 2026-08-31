import { describe, expect, it } from "vitest"

import {
  aCentavos,
  formatearCentavos,
  formatearEntrada,
  formatearMonto,
  formatearSaldo,
} from "./dinero"

describe("formatearEntrada", () => {
  it("agrupa miles en la parte entera", () => {
    expect(formatearEntrada("1234567")).toBe("1.234.567")
  })
  it("conserva la coma decimal en curso", () => {
    expect(formatearEntrada("1234,5")).toBe("1.234,5")
    expect(formatearEntrada("1234,")).toBe("1.234,")
  })
  it("sin cambios para valores chicos", () => {
    expect(formatearEntrada("0")).toBe("0")
  })
})

describe("formatearSaldo", () => {
  it("saldo positivo sin signo", () => {
    expect(formatearSaldo(100000)).toBe("$ 1.000,00")
  })
  it("saldo negativo con signo menos", () => {
    expect(formatearSaldo(-50000)).toBe("-$ 500,00")
  })
  it("otra moneda", () => {
    expect(formatearSaldo(-1000, "USD")).toBe("-USD 10,00")
  })
})

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
