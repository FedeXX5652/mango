import { describe, expect, it } from "vitest"

import { correr, etiquetaCorta, serie, ventanaDe } from "@/lib/periodo"

// Los limites se comparan como fecha local, que es como se guarda `occurred_at`.
function dia(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

describe("ventanaDe", () => {
  it("dia: del dia a la medianoche siguiente", () => {
    const v = ventanaDe("dia", new Date(2026, 8, 14))
    expect(dia(v.inicio)).toBe("2026-09-14")
    expect(dia(v.fin)).toBe("2026-09-15")
    expect(v.etiqueta).toBe("Lunes 14 de septiembre")
  })

  it("semana: arranca el lunes", () => {
    // El 14/09/2026 es lunes.
    const v = ventanaDe("semana", new Date(2026, 8, 16))
    expect(dia(v.inicio)).toBe("2026-09-14")
    expect(dia(v.fin)).toBe("2026-09-21")
  })

  it("semana: el domingo pertenece a la que arranco el lunes anterior", () => {
    // El error clasico: con getDay()===0 el domingo cae en la semana que viene.
    const v = ventanaDe("semana", new Date(2026, 8, 20))
    expect(dia(v.inicio)).toBe("2026-09-14")
    expect(dia(v.fin)).toBe("2026-09-21")
  })

  it("semana: si cruza de mes lo dice en la etiqueta", () => {
    const v = ventanaDe("semana", new Date(2026, 8, 30))
    expect(v.etiqueta).toBe("28 de septiembre al 4 de octubre")
  })

  it("mes y año", () => {
    const m = ventanaDe("mes", new Date(2026, 8, 14))
    expect(dia(m.inicio)).toBe("2026-09-01")
    expect(dia(m.fin)).toBe("2026-10-01")
    expect(m.etiqueta).toBe("Septiembre de 2026")

    const a = ventanaDe("anio", new Date(2026, 8, 14))
    expect(dia(a.inicio)).toBe("2026-01-01")
    expect(dia(a.fin)).toBe("2027-01-01")
    expect(a.etiqueta).toBe("2026")
  })

  it("diciembre avanza de año", () => {
    const v = ventanaDe("mes", new Date(2026, 11, 5))
    expect(dia(v.fin)).toBe("2027-01-01")
  })
})

describe("correr", () => {
  it("mueve un periodo para cada lado", () => {
    expect(dia(ventanaDe("dia", correr("dia", new Date(2026, 8, 14), 1)).inicio)).toBe("2026-09-15")
    expect(dia(ventanaDe("semana", correr("semana", new Date(2026, 8, 14), -1)).inicio)).toBe(
      "2026-09-07",
    )
    expect(dia(ventanaDe("anio", correr("anio", new Date(2026, 8, 14), 1)).inicio)).toBe(
      "2027-01-01",
    )
  })

  it("el 31 no desborda al mes siguiente", () => {
    // 31 de enero + 1 mes con aritmetica ingenua cae en marzo, porque el 31 de
    // febrero no existe y JavaScript lo desborda sin avisar.
    const siguiente = correr("mes", new Date(2026, 0, 31), 1)
    expect(ventanaDe("mes", siguiente).etiqueta).toBe("Febrero de 2026")
  })

  it("ir y volver deja la misma ventana", () => {
    const hoy = new Date(2026, 8, 14)
    const ida = correr("mes", hoy, 1)
    const vuelta = correr("mes", ida, -1)
    expect(ventanaDe("mes", vuelta).inicio).toBe(ventanaDe("mes", hoy).inicio)
  })
})

describe("serie", () => {
  it("devuelve del mas viejo al mas nuevo, terminando en el ancla", () => {
    const s = serie("mes", new Date(2026, 8, 14), 3)
    expect(s.map((v) => v.etiqueta)).toEqual([
      "Julio de 2026",
      "Agosto de 2026",
      "Septiembre de 2026",
    ])
  })

  it("sigue al periodo elegido: con semanas da semanas", () => {
    const s = serie("semana", new Date(2026, 8, 14), 2)
    expect(s.map((v) => dia(v.inicio))).toEqual(["2026-09-07", "2026-09-14"])
  })
})

describe("etiquetaCorta", () => {
  it("entra en el eje del grafico", () => {
    const hoy = new Date(2026, 8, 14)
    expect(etiquetaCorta("mes", ventanaDe("mes", hoy))).toBe("sep")
    expect(etiquetaCorta("anio", ventanaDe("anio", hoy))).toBe("2026")
    expect(etiquetaCorta("dia", ventanaDe("dia", hoy))).toBe("14/9")
  })
})
