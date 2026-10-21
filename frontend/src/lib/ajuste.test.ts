import { describe, expect, it } from "vitest"

import { ajusteDeSaldo } from "@/lib/ajuste"

describe("ajusteDeSaldo", () => {
  it("si sube, es un ingreso por la diferencia", () => {
    expect(ajusteDeSaldo(100000, 125050)).toEqual({ kind: "income", amount: 25050 })
  })

  it("si baja, es un egreso por la diferencia", () => {
    expect(ajusteDeSaldo(200000, 175000)).toEqual({ kind: "expense", amount: 25000 })
  })

  it("si es el mismo saldo, no hay nada que anotar", () => {
    expect(ajusteDeSaldo(500, 500)).toBeNull()
  })

  it("con saldos negativos (una tarjeta)", () => {
    // La tarjeta debe menos de lo que la app calcula: el saldo sube.
    expect(ajusteDeSaldo(-1234567, -1000000)).toEqual({ kind: "income", amount: 234567 })
  })

  it("al cruzar el cero", () => {
    expect(ajusteDeSaldo(10000, -5000)).toEqual({ kind: "expense", amount: 15000 })
  })

  it("montos grandes sin perder centavos", () => {
    expect(ajusteDeSaldo(0, 9_007_199_254_740_991)).toEqual({
      kind: "income",
      amount: 9_007_199_254_740_991,
    })
  })
})
