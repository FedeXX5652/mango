import { describe, expect, it } from "vitest"

import { cuandoPosponer, textoHasta } from "@/lib/posponer"

// Fechas en hora local (como las arma la app): new Date(año, mes-1, dia, h, m).
const d = (dia: number, h: number, m = 0) => new Date(2026, 9, dia, h, m)

describe("más tarde", () => {
  it("los atajos", () => {
    expect(cuandoPosponer("1h", d(12, 10))).toEqual(d(12, 11))
    expect(cuandoPosponer("3h", d(12, 10))).toEqual(d(12, 13))
    // A cualquier hora (2026-10-08): tres horas desde las 20 son las 23.
    expect(cuandoPosponer("3h", d(12, 20))).toEqual(d(12, 23))
    expect(cuandoPosponer("manana", d(12, 20))).toEqual(d(13, 9))
    // 2026-10-12 es lunes: "el lunes" es el de la semana que viene.
    expect(cuandoPosponer("lunes", d(12, 10))).toEqual(d(19, 9))
    // Desde un sabado, el lunes que viene.
    expect(cuandoPosponer("lunes", d(10, 10))).toEqual(d(12, 9))
  })

  it("cómo se dice hasta cuándo", () => {
    expect(textoHasta(d(12, 15), d(12, 10))).toBe("hoy a las 15:00")
    expect(textoHasta(d(13, 9), d(12, 20))).toBe("mañana a las 09:00")
    expect(textoHasta(d(19, 9), d(12, 10))).toBe("el lunes 19/10/2026 a las 09:00")
  })
})
