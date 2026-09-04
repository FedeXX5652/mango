import { describe, expect, it } from "vitest"

import { nombreExport, parametrosExport, tieneFilas } from "./exportar"

const HOY = new Date(2026, 8, 4) // 4 de septiembre de 2026 (local)

describe("parametrosExport", () => {
  it("mes: desde el 1 hasta el 1 del mes siguiente (fin exclusivo)", () => {
    const p = parametrosExport({ rango: "mes" }, HOY)
    expect(p.date_from).toBe(new Date(2026, 8, 1).toISOString())
    expect(p.date_to).toBe(new Date(2026, 9, 1).toISOString())
  })

  it("anio: del 1 de enero al 1 de enero siguiente", () => {
    const p = parametrosExport({ rango: "anio" }, HOY)
    expect(p.date_from).toBe(new Date(2026, 0, 1).toISOString())
    expect(p.date_to).toBe(new Date(2027, 0, 1).toISOString())
  })

  it("todo: sin fechas", () => {
    const p = parametrosExport({ rango: "todo" }, HOY)
    expect(p.date_from).toBeUndefined()
    expect(p.date_to).toBeUndefined()
  })

  it("personalizado: el dia 'hasta' entra completo", () => {
    const p = parametrosExport(
      { rango: "personalizado", desde: "2026-08-01", hasta: "2026-08-31" },
      HOY,
    )
    expect(p.date_from).toBe(new Date(2026, 7, 1).toISOString())
    // 31/08 inclusive -> el corte va al 1/09
    expect(p.date_to).toBe(new Date(2026, 8, 1).toISOString())
  })

  it("pasa los filtros opcionales con el nombre del endpoint", () => {
    const p = parametrosExport(
      { rango: "todo", tipo: "expense", cuentaId: "c1", categoriaId: "k1" },
      HOY,
    )
    expect(p).toEqual({ kind: "expense", account_id: "c1", category_id: "k1" })
  })
})

describe("nombreExport", () => {
  it("usa la fecha del dia", () => {
    expect(nombreExport(HOY)).toBe("mango-movimientos-2026-09-04.csv")
  })
})

describe("tieneFilas", () => {
  it("solo encabezado = sin filas", () => {
    expect(tieneFilas("fecha,tipo,monto\n")).toBe(false)
  })
  it("encabezado + fila = con filas", () => {
    expect(tieneFilas("fecha,tipo,monto\n2026-09-01,expense,10.00\n")).toBe(true)
  })
})
