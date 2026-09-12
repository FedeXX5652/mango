import { describe, expect, it } from "vitest"

import { filtrarMonedas, listarMonedas, monedaPorDefecto, ordenarMonedas } from "@/lib/monedas"

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

describe("listarMonedas", () => {
  it("trae la lista ISO completa, no solo las que ya usas", () => {
    // El caso que motivo la pantalla: te mudas a Portugal y EUR todavia no
    // aparece en ningun dato tuyo.
    const lista = listarMonedas(["ARS"])
    expect(lista.length).toBeGreaterThan(50)
    expect(lista.map((m) => m.codigo)).toContain("EUR")
  })

  it("pone arriba las monedas en uso", () => {
    const lista = listarMonedas(["USD", "MXN"])
    expect(lista.slice(0, 2).map((m) => m.codigo)).toEqual(["MXN", "USD"])
  })

  it("le pone nombre a cada una", () => {
    const usd = listarMonedas().find((m) => m.codigo === "USD")
    // El nombre sale de Intl; lo que importa es que no sea el codigo pelado.
    expect(usd?.nombre.length).toBeGreaterThan(3)
  })

  it("no repite una moneda en uso que ya esta en la lista ISO", () => {
    const codigos = listarMonedas(["USD"]).map((m) => m.codigo)
    expect(codigos.filter((c) => c === "USD")).toHaveLength(1)
  })
})

describe("filtrarMonedas", () => {
  const lista = [
    { codigo: "USD", nombre: "dólar estadounidense" },
    { codigo: "ARS", nombre: "peso argentino" },
    { codigo: "EUR", nombre: "euro" },
  ]

  it("busca por codigo", () => {
    expect(filtrarMonedas(lista, "ars").map((m) => m.codigo)).toEqual(["ARS"])
  })

  it("busca por nombre sin tildes", () => {
    // Nadie escribe "dólar" con tilde en un buscador.
    expect(filtrarMonedas(lista, "dolar").map((m) => m.codigo)).toEqual(["USD"])
  })

  it("sin texto devuelve todo", () => {
    expect(filtrarMonedas(lista, "  ")).toHaveLength(3)
  })
})
