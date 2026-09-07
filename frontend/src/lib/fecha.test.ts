import { describe, expect, it } from "vitest"

import { fechaISO, formatearFechaCorta, mesAnio } from "@/lib/fecha"

describe("fechaISO", () => {
  it("usa la fecha local, no UTC", () => {
    // 23:50 del 31 en Argentina ya es dia 1 en UTC: no debe correrse.
    expect(fechaISO(new Date(2026, 7, 31, 23, 50))).toBe("2026-08-31")
  })
  it("rellena mes y dia con cero", () => {
    expect(fechaISO(new Date(2026, 0, 5))).toBe("2026-01-05")
  })
})

describe("formatearFechaCorta", () => {
  it("no corre el dia al parsear un ISO corto", () => {
    expect(formatearFechaCorta("2026-09-06")).toBe("06/09/2026")
  })
})

describe("mesAnio", () => {
  it("capitaliza solo la primera letra", () => {
    expect(mesAnio(2026, 8)).toBe("Septiembre de 2026")
  })
})
