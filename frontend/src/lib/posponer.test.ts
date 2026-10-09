import { describe, expect, it } from "vitest"

import { alHorario, cuandoPosponer, textoHasta } from "@/lib/posponer"

// Fechas en hora local (como las arma la app): new Date(año, mes-1, dia, h, m).
const d = (dia: number, h: number, m = 0) => new Date(2026, 9, dia, h, m)

describe("más tarde", () => {
  it("nunca entre las 22 y las 8", () => {
    expect(alHorario(d(12, 23, 30))).toEqual(d(13, 8))
    expect(alHorario(d(12, 6))).toEqual(d(12, 8))
    expect(alHorario(d(12, 10, 15))).toEqual(d(12, 10, 15))
    expect(alHorario(d(12, 22))).toEqual(d(13, 8))
  })

  it("los atajos", () => {
    expect(cuandoPosponer("1h", d(12, 10))).toEqual(d(12, 11))
    expect(cuandoPosponer("3h", d(12, 10))).toEqual(d(12, 13))
    // Tres horas desde las 20 son las 23: pasa a las 8 del dia siguiente.
    expect(cuandoPosponer("3h", d(12, 20))).toEqual(d(13, 8))
    expect(cuandoPosponer("manana", d(12, 20))).toEqual(d(13, 9))
    // 2026-10-12 es lunes: "el lunes" es el de la semana que viene.
    expect(cuandoPosponer("lunes", d(12, 10))).toEqual(d(19, 9))
    // Desde un sabado, el lunes que viene.
    expect(cuandoPosponer("lunes", d(10, 10))).toEqual(d(12, 9))
  })

  it("cómo se dice hasta cuándo", () => {
    expect(textoHasta(d(12, 15), d(12, 10))).toBe("hoy a las 15:00")
    expect(textoHasta(d(13, 9), d(12, 20))).toBe("mañana a las 09:00")
    expect(textoHasta(d(19, 9), d(12, 10))).toBe("el lunes 19/10 a las 09:00")
  })
})
