import { describe, expect, it } from "vitest"

import { DESTINOS, DESTINOS_MOVIL, esPestana } from "@/componentes/navegacion"

// La barra movil es 2 + "+" + 2 en cinco columnas iguales (DESIGN.md 2, 0022):
// con otra cantidad el "+" deja de caer en el centro. Este test es el que frena
// el error de sumar un quinto destino "apretado".
describe("navegacion", () => {
  it("la barra movil tiene exactamente cuatro destinos", () => {
    expect(DESTINOS_MOVIL).toHaveLength(4)
  })

  it("cada destino movil existe tambien en escritorio", () => {
    const rutas = DESTINOS.map((d) => d.to)
    for (const d of DESTINOS_MOVIL) expect(rutas).toContain(d.to)
  })

  it("la barra movil son las cuatro secciones de un espacio (0026)", () => {
    // Siguen al espacio actual: en Casa, Movimientos es el de Casa.
    expect(DESTINOS_MOVIL.map((d) => d.seccion)).toEqual([
      "",
      "movimientos",
      "presupuesto",
      "estadisticas",
    ])
  })

  it("Ajustes y Grupos quedan fuera de la barra movil, no de escritorio", () => {
    const movil = DESTINOS_MOVIL.map((d) => d.to)
    expect(movil).not.toContain("/ajustes")
    expect(movil).not.toContain("/grupos")
    const escritorio = DESTINOS.map((d) => d.to)
    expect(escritorio).toContain("/ajustes")
    expect(escritorio).toContain("/grupos")
  })

  it("Inicio es el primero y solo activa en su ruta exacta", () => {
    expect(DESTINOS_MOVIL[0]).toMatchObject({ to: "/", end: true })
  })
})

// Que pantalla entra animada en el movil (1.9.0): las que se abren desde otra,
// no las pestañas (que cambian al instante) ni el alta (tiene la suya).
describe("esPestana", () => {
  it("las cuatro secciones y el alta, personales y de un grupo", () => {
    for (const r of ["/", "/movimientos", "/presupuesto", "/estadisticas", "/nuevo"])
      expect(esPestana(r)).toBe(true)
    for (const r of ["/grupos/g1", "/grupos/g1/movimientos", "/grupos/g1/nuevo"])
      expect(esPestana(r)).toBe(true)
  })

  it("lo que se abre desde otra pantalla no es pestaña", () => {
    for (const r of [
      "/cuentas",
      "/ajustes",
      "/movimientos/abc",
      "/grupos",
      "/grupos/g1/ajustes",
      "/grupos/g1/calendario",
      "/grupos/g1/movimientos/abc",
    ])
      expect(esPestana(r)).toBe(false)
  })
})
