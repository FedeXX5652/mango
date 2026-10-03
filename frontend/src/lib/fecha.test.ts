import { describe, expect, it } from "vitest"

import { claveDia, etiquetaDia, fechaISO, formatearFechaCorta, mesAnio } from "@/lib/fecha"

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
  it("un momento se muestra con su dia LOCAL, no el UTC", () => {
    // 23:53 del 1 de octubre en la hora local: en UTC (en Argentina) ya es el 2.
    const noche = new Date(2026, 9, 1, 23, 53).toISOString()
    expect(formatearFechaCorta(noche)).toBe("01/10/2026")
  })
})

describe("dias de una lista", () => {
  const noche = new Date(2026, 9, 1, 23, 53).toISOString()
  it("la clave es el dia local", () => {
    expect(claveDia(noche)).toBe("2026-10-01")
  })
  it("hoy, ayer y el resto por fecha", () => {
    const hoy = new Date(2026, 9, 1, 9, 0)
    expect(etiquetaDia(noche, hoy)).toBe("Hoy")
    expect(etiquetaDia(new Date(2026, 8, 30, 22, 0).toISOString(), hoy)).toBe("Ayer")
    expect(etiquetaDia(new Date(2026, 8, 6, 12, 0).toISOString(), hoy)).toBe("6 de septiembre")
    expect(etiquetaDia(new Date(2025, 8, 6, 12, 0).toISOString(), hoy)).toBe(
      "6 de septiembre de 2025",
    )
  })
})

describe("mesAnio", () => {
  it("capitaliza solo la primera letra", () => {
    expect(mesAnio(2026, 8)).toBe("Septiembre de 2026")
  })
})
