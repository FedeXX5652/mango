import { describe, expect, it } from "vitest"

import { PERSONAL, espacioDeRuta, rutaEspacio, seccionDeRuta } from "@/lib/espacios"

const CASA = { tipo: "grupo", id: "casa-1" } as const

describe("rutas por espacio", () => {
  it("Personal vive en la raiz", () => {
    expect(rutaEspacio(PERSONAL)).toBe("/")
    expect(rutaEspacio(PERSONAL, "movimientos")).toBe("/movimientos")
    expect(rutaEspacio(PERSONAL, "presupuesto")).toBe("/presupuesto")
  })

  it("un grupo vive en /grupos/<id>, con los mismos nombres de seccion", () => {
    expect(rutaEspacio(CASA)).toBe("/grupos/casa-1")
    expect(rutaEspacio(CASA, "movimientos")).toBe("/grupos/casa-1/movimientos")
    expect(rutaEspacio(CASA, "estadisticas")).toBe("/grupos/casa-1/estadisticas")
    expect(rutaEspacio(CASA, "ajustes")).toBe("/grupos/casa-1/ajustes")
  })
})

describe("espacio de una direccion", () => {
  it("lo de un grupo es del grupo, en cualquier seccion", () => {
    expect(espacioDeRuta("/grupos/casa-1")).toEqual(CASA)
    expect(espacioDeRuta("/grupos/casa-1/movimientos/tx-9")).toEqual(CASA)
  })

  it("todo lo demas es Personal, incluida la lista de grupos y el atajo", () => {
    expect(espacioDeRuta("/")).toEqual(PERSONAL)
    expect(espacioDeRuta("/movimientos")).toEqual(PERSONAL)
    expect(espacioDeRuta("/grupos")).toEqual(PERSONAL)
    expect(espacioDeRuta("/grupos/ultimo")).toEqual(PERSONAL)
  })

  it("ida y vuelta: la ruta de un espacio vuelve al mismo espacio", () => {
    for (const e of [PERSONAL, CASA])
      expect(espacioDeRuta(rutaEspacio(e, "presupuesto"))).toEqual(e)
  })
})

describe("seccion actual", () => {
  it("reconoce las secciones comunes en los dos espacios", () => {
    expect(seccionDeRuta("/movimientos")).toBe("movimientos")
    expect(seccionDeRuta("/movimientos/tx-1")).toBe("movimientos")
    expect(seccionDeRuta("/grupos/casa-1/estadisticas")).toBe("estadisticas")
  })

  it("Inicio, Ajustes y lo demas no son comunes", () => {
    expect(seccionDeRuta("/")).toBe("")
    expect(seccionDeRuta("/grupos/casa-1")).toBe("")
    expect(seccionDeRuta("/ajustes")).toBe("")
    expect(seccionDeRuta("/grupos/casa-1/ajustes")).toBe("")
    expect(seccionDeRuta("/metas")).toBe("")
  })
})
