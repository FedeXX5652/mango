import { describe, expect, it } from "vitest"

import { gastoDelDia, netoDelDia } from "@/lib/resumenDia"

const fila = (kind: string, amount: number, currency = "ARS", status = "confirmed") => ({
  kind,
  amount,
  currency,
  status,
})

describe("netoDelDia", () => {
  it("ingresos menos gastos", () => {
    expect(netoDelDia([fila("income", 100000), fila("expense", 30000)], "ARS")).toEqual([
      { moneda: "ARS", neto: 70000 },
    ])
  })

  it("las transferencias y lo no confirmado no cuentan", () => {
    const filas = [
      fila("expense", 5000),
      fila("transfer", 99999),
      fila("expense", 7000, "ARS", "pending"),
    ]
    expect(netoDelDia(filas, "ARS")).toEqual([{ moneda: "ARS", neto: -5000 }])
  })

  it("un dia solo con transferencias no tiene total", () => {
    expect(netoDelDia([fila("transfer", 1000)], "ARS")).toEqual([])
  })

  it("cada moneda por separado, la base primero, sin convertir", () => {
    const filas = [fila("expense", 2000, "USD"), fila("expense", 1000, "EUR"), fila("expense", 500)]
    expect(netoDelDia(filas, "ARS")).toEqual([
      { moneda: "ARS", neto: -500 },
      { moneda: "EUR", neto: -1000 },
      { moneda: "USD", neto: -2000 },
    ])
  })

  it("si se compensan, el total es cero (no desaparece)", () => {
    expect(netoDelDia([fila("income", 1000), fila("expense", 1000)], "ARS")).toEqual([
      { moneda: "ARS", neto: 0 },
    ])
  })

  it("montos grandes sin perder centavos", () => {
    const grande = 9_007_199_254_740_991
    expect(netoDelDia([fila("income", grande)], "ARS")).toEqual([{ moneda: "ARS", neto: grande }])
  })
})

describe("gastoDelDia", () => {
  it("solo los gastos del grupo, en negativo", () => {
    const items = [
      { tipo: "gasto", amount: 12000, currency: "ARS" },
      { tipo: "pago", amount: 5000, currency: "ARS" },
      { tipo: "aporte", amount: 30000, currency: "ARS" },
      { tipo: "gasto", amount: 3000, currency: "ARS" },
    ]
    expect(gastoDelDia(items, "ARS")).toEqual([{ moneda: "ARS", neto: -15000 }])
  })
})
