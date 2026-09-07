import { describe, expect, it } from "vitest"

import { monedaPorDefecto, ordenarMonedas } from "@/lib/monedas"

describe("ordenarMonedas", () => {
  it("pone la base primero y el resto alfabetico", () => {
    expect(ordenarMonedas(["USD", "BRL", "ARS", "EUR"], "ARS")).toEqual([
      "ARS",
      "BRL",
      "EUR",
      "USD",
    ])
  })
  it("no repite y normaliza a mayusculas", () => {
    expect(ordenarMonedas(["usd", "USD", " usd "], "ARS")).toEqual(["USD"])
  })
  it("descarta vacios y nulos", () => {
    expect(ordenarMonedas([null, undefined, "", "  ", "ARS"], "ARS")).toEqual(["ARS"])
  })
  it("si la base no tiene datos no la agrega", () => {
    expect(ordenarMonedas(["USD"], "ARS")).toEqual(["USD"])
  })
  it("sin datos devuelve vacio", () => {
    expect(ordenarMonedas([], "ARS")).toEqual([])
  })
})

describe("monedaPorDefecto", () => {
  it("elige la base cuando tiene datos", () => {
    expect(monedaPorDefecto(["ARS", "USD"], "ARS")).toBe("ARS")
  })
  it("si la base no tiene datos, la primera disponible", () => {
    expect(monedaPorDefecto(["USD", "EUR"], "ARS")).toBe("USD")
  })
  it("sin datos, la base", () => {
    expect(monedaPorDefecto([], "usd")).toBe("USD")
  })
})
