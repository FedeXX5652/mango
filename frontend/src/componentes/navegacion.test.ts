import { describe, expect, it } from "vitest"

import { DESTINOS, DESTINOS_MOVIL } from "@/componentes/navegacion"

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

  it("Ajustes y Estadisticas quedan fuera de la barra movil, no de escritorio", () => {
    const movil = DESTINOS_MOVIL.map((d) => d.to)
    expect(movil).not.toContain("/ajustes")
    expect(movil).not.toContain("/estadisticas")
    const escritorio = DESTINOS.map((d) => d.to)
    expect(escritorio).toContain("/ajustes")
    expect(escritorio).toContain("/estadisticas")
  })

  it("Inicio es el primero y solo activa en su ruta exacta", () => {
    expect(DESTINOS_MOVIL[0]).toMatchObject({ to: "/", end: true })
  })
})
