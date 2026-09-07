import { afterEach, describe, expect, it } from "vitest"

import {
  aCentavos,
  configurarMonedaBase,
  decimalesDe,
  factorDe,
  formatearCentavos,
  formatearEntrada,
  formatearMonto,
  formatearSaldo,
  monedaBase,
  partesMonto,
} from "./dinero"

// La moneda base es estado de modulo: cada prueba que la cambia la devuelve a
// ARS, que es el default del esquema.
afterEach(() => configurarMonedaBase("ARS"))

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
  it("otra moneda queda desambiguada", () => {
    expect(formatearSaldo(-1000, "USD")).toBe("-US$ 10,00")
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
  it("en una moneda sin decimales no inventa centavos", () => {
    expect(formatearCentavos(1235, "JPY")).toBe("1.235")
  })
})

describe("formatearMonto", () => {
  it("gasto lleva signo menos", () => {
    expect(formatearMonto(230272, { direccion: "gasto" })).toBe("-$ 2.302,72")
  })
  it("ingreso lleva signo mas", () => {
    expect(formatearMonto(150000, { direccion: "ingreso" })).toBe("+$ 1.500,00")
  })
  it("la moneda base va con su simbolo corto", () => {
    expect(formatearMonto(230272, { moneda: "ARS" })).toBe("$ 2.302,72")
  })
  it("otra moneda va con el simbolo desambiguado de la convencion local", () => {
    expect(formatearMonto(1000, { moneda: "USD" })).toBe("US$ 10,00")
    expect(formatearMonto(123450, { moneda: "BRL" })).toBe("BRL 1.234,50")
  })
  it("moneda sin decimales: el entero son unidades, no centavos", () => {
    expect(formatearMonto(1235, { moneda: "JPY" })).toBe("JPY 1.235")
  })
  it("con base USD, el dolar va limpio y el peso con codigo", () => {
    configurarMonedaBase("usd")
    expect(monedaBase()).toBe("USD")
    expect(formatearMonto(1000, { moneda: "USD" })).toBe("$ 10,00")
    // ARS y USD comparten "$" en es-AR: sin el codigo serian indistinguibles.
    expect(formatearMonto(230272, { moneda: "ARS" })).toBe("ARS 2.302,72")
  })
  it("sin moneda usa la base configurada", () => {
    configurarMonedaBase("USD")
    expect(formatearMonto(1000)).toBe("$ 10,00")
  })
})

describe("decimalesDe / factorDe", () => {
  it("dos decimales en las monedas habituales", () => {
    for (const c of ["ARS", "USD", "EUR", "GBP", "BRL"]) {
      expect(decimalesDe(c)).toBe(2)
      expect(factorDe(c)).toBe(100)
    }
  })
  it("cero decimales en JPY y CLP: la unidad menor es la unidad", () => {
    expect(decimalesDe("JPY")).toBe(0)
    expect(factorDe("JPY")).toBe(1)
    expect(decimalesDe("CLP")).toBe(0)
    expect(factorDe("CLP")).toBe(1)
  })
  it("un codigo desconocido no rompe: asume dos", () => {
    expect(decimalesDe("XXZ")).toBe(2)
  })
})

describe("partesMonto", () => {
  it("separa simbolo, entero y decimales", () => {
    expect(partesMonto(230272)).toEqual({
      signo: "",
      simbolo: "$",
      entero: "2.302",
      separador: ",",
      fraccion: "72",
      numero: "2.302,72",
    })
  })
  it("el signo sale de la direccion y el simbolo de la moneda", () => {
    expect(partesMonto(1000, { moneda: "USD", direccion: "gasto" })).toEqual({
      signo: "-",
      simbolo: "US$",
      entero: "10",
      separador: ",",
      fraccion: "00",
      numero: "10,00",
    })
  })
  it("una moneda sin decimales no trae fraccion ni separador", () => {
    expect(partesMonto(1235, { moneda: "JPY" })).toEqual({
      signo: "",
      simbolo: "JPY",
      entero: "1.235",
      separador: "",
      fraccion: "",
      numero: "1.235",
    })
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
  it("convierte con el factor de la moneda", () => {
    expect(aCentavos("1235", "JPY")).toBe(1235)
    expect(aCentavos("1235", "ARS")).toBe(123500)
  })
})
