import { describe, expect, it } from "vitest"

import {
  ACCESOS,
  DE_FABRICA,
  HERRAMIENTAS_ESCRITORIO,
  MAX_EN_INICIO,
  agregarAcceso,
  moverAcceso,
  normalizarAccesos,
  quitarAcceso,
} from "@/componentes/accesos"

describe("catalogo de accesos", () => {
  it("los ids son unicos y con la forma que acepta el servidor", () => {
    const ids = ACCESOS.map((a) => a.id)
    expect(new Set(ids).size).toBe(ids.length)
    // Misma regla que IdAcceso en backend/app/schemas/user.py.
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]{1,40}$/)
  })

  it("los de fabrica y las herramientas de escritorio existen en el catalogo", () => {
    const ids = ACCESOS.map((a) => a.id)
    for (const id of [...DE_FABRICA, ...HERRAMIENTAS_ESCRITORIO]) expect(ids).toContain(id)
    expect(DE_FABRICA).toHaveLength(MAX_EN_INICIO)
  })

  it("el nombre corto entra en la baldosa del panel", () => {
    for (const a of ACCESOS) expect(a.corta.length).toBeLessThanOrEqual(12)
  })
})

describe("normalizar lo guardado", () => {
  it("sin dato son los de fabrica", () => {
    expect(normalizarAccesos(null)).toEqual(DE_FABRICA)
    expect(normalizarAccesos(undefined)).toEqual(DE_FABRICA)
  })

  it("respeta el orden elegido", () => {
    expect(normalizarAccesos(["deudas", "metas"])).toEqual(["deudas", "metas"])
  })

  it("descarta ids que ya no existen y repetidos, y corta en el tope", () => {
    expect(normalizarAccesos(["viejo", "metas", "metas", "deudas"])).toEqual(["metas", "deudas"])
    expect(
      normalizarAccesos(["metas", "deudas", "recurrentes", "plantillas", "cuentas"]),
    ).toHaveLength(MAX_EN_INICIO)
  })

  it("una lista vacia es vacia (la persona saco todos), no los de fabrica", () => {
    expect(normalizarAccesos([])).toEqual([])
  })
})

describe("editar", () => {
  it("agrega al final, sin repetir ni pasar el tope", () => {
    expect(agregarAcceso(["metas"], "deudas")).toEqual(["metas", "deudas"])
    expect(agregarAcceso(["metas"], "metas")).toEqual(["metas"])
    expect(agregarAcceso(["metas", "deudas", "recurrentes", "plantillas"], "cuentas")).toHaveLength(
      4,
    )
    expect(agregarAcceso(["metas"], "no-existe")).toEqual(["metas"])
  })

  it("quita", () => {
    expect(quitarAcceso(["metas", "deudas"], "metas")).toEqual(["deudas"])
  })

  it("mueve un lugar, y en los bordes no hace nada", () => {
    expect(moverAcceso(["a", "b", "c"], "b", -1)).toEqual(["b", "a", "c"])
    expect(moverAcceso(["a", "b", "c"], "b", 1)).toEqual(["a", "c", "b"])
    expect(moverAcceso(["a", "b", "c"], "a", -1)).toEqual(["a", "b", "c"])
    expect(moverAcceso(["a", "b", "c"], "c", 1)).toEqual(["a", "b", "c"])
  })
})
