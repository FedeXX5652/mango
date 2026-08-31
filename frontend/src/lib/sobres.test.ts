import { describe, expect, it } from "vitest"

import { type DatosSobres, type EntradaSobre, calcularMes } from "./sobres"

const sinRollover = (id: string): EntradaSobre => ({ categoryId: id, rollover: false })
const conRollover = (id: string): EntradaSobre => ({ categoryId: id, rollover: true })

function saldo(r: ReturnType<typeof calcularMes>, id: string): number {
  return r.sobres.find((s) => s.categoryId === id)!.balance
}

describe("sobres", () => {
  it("cierra el invariante del ejemplo verificado", () => {
    const d: DatosSobres = {
      sobres: [sinRollover("comida"), sinRollover("delivery"), sinRollover("super"), sinRollover("transporte")],
      asignado: new Map([
        ["comida|2026-08", 100000],
        ["delivery|2026-08", 30000],
        ["super|2026-08", 50000],
        ["transporte|2026-08", 20000],
      ]),
      gastado: new Map([
        ["comida|2026-08", 20000],
        ["delivery|2026-08", 25000],
        ["super|2026-08", 48000],
        ["transporte|2026-08", 12000],
      ]),
      fondos: 295000,
      meses: ["2026-08"],
    }
    const r = calcularMes(d)
    expect(saldo(r, "comida")).toBe(80000)
    expect(saldo(r, "delivery")).toBe(5000)
    expect(saldo(r, "super")).toBe(2000)
    expect(saldo(r, "transporte")).toBe(8000)
    expect(r.porAsignar).toBe(200000) // 295000 - 95000
  })

  it("un sobre de ahorro (rollover) acumula mes a mes", () => {
    const d: DatosSobres = {
      sobres: [conRollover("viaje")],
      asignado: new Map([
        ["viaje|2026-08", 20000],
        ["viaje|2026-09", 20000],
      ]),
      gastado: new Map(),
      fondos: 100000,
      meses: ["2026-08", "2026-09"],
    }
    expect(saldo(calcularMes(d), "viaje")).toBe(40000)
  })

  it("sin rollover: el positivo vuelve a por asignar, el negativo arrastra en rojo", () => {
    const positivo: DatosSobres = {
      sobres: [sinRollover("a")],
      asignado: new Map([["a|2026-08", 10000], ["a|2026-09", 10000]]),
      gastado: new Map([["a|2026-08", 3000]]),
      fondos: 0,
      meses: ["2026-08", "2026-09"],
    }
    // El sobrante 7000 no arrastra: septiembre queda en 10000, no 17000.
    expect(saldo(calcularMes(positivo), "a")).toBe(10000)

    const rojo: DatosSobres = {
      sobres: [sinRollover("a")],
      asignado: new Map([["a|2026-08", 10000], ["a|2026-09", 10000]]),
      gastado: new Map([["a|2026-08", 15000]]),
      fondos: 0,
      meses: ["2026-08", "2026-09"],
    }
    // Sobregiro -5000 arrastra: septiembre 10000 - 5000 = 5000.
    expect(saldo(calcularMes(rojo), "a")).toBe(5000)
  })

  it("por asignar puede ser negativo (presupuesto plata que no tengo)", () => {
    const d: DatosSobres = {
      sobres: [sinRollover("a")],
      asignado: new Map([["a|2026-08", 80000]]),
      gastado: new Map(),
      fondos: 50000,
      meses: ["2026-08"],
    }
    expect(calcularMes(d).porAsignar).toBe(-30000)
  })

  it("sin asignacion explicita el sobre queda en 0 asignado", () => {
    const d: DatosSobres = {
      sobres: [sinRollover("a")],
      asignado: new Map(),
      gastado: new Map([["a|2026-08", 5000]]),
      fondos: 0,
      meses: ["2026-08"],
    }
    expect(saldo(calcularMes(d), "a")).toBe(-5000) // 0 asignado - 5000 gastado
  })
})
