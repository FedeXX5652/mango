import { describe, expect, it } from "vitest"

import {
  ACCESOS,
  DE_FABRICA,
  DE_FABRICA_GRUPO,
  HERRAMIENTAS_ESCRITORIO,
  HERRAMIENTAS_GRUPO_ESCRITORIO,
  MAX_EN_INICIO,
  SECCIONES,
  accesosDeGrupo,
  agregarAcceso,
  catalogoDe,
  conAccesosDeGrupo,
  deFabricaDe,
  mapaJson,
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

describe("el mismo sistema en un grupo (1.13.0)", () => {
  const grupo = accesosDeGrupo("g1")
  const espacioGrupo = { tipo: "grupo" as const, id: "g1" }

  it("el catalogo del grupo cumple las mismas reglas que el personal", () => {
    const ids = grupo.map((a) => a.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const a of grupo) {
      expect(a.id).toMatch(/^[a-z0-9-]{1,40}$/)
      expect(a.corta.length).toBeLessThanOrEqual(12)
      expect(a.detalle).not.toBe("")
    }
    for (const id of [...DE_FABRICA_GRUPO, ...HERRAMIENTAS_GRUPO_ESCRITORIO])
      expect(ids).toContain(id)
    expect(DE_FABRICA_GRUPO).toHaveLength(MAX_EN_INICIO)
  })

  it("los dos espacios usan las mismas secciones, en el mismo orden", () => {
    for (const catalogo of [ACCESOS, grupo])
      for (const s of SECCIONES) expect(catalogo.some((a) => a.seccion === s.id)).toBe(true)
  })

  it("normaliza contra el catalogo de su espacio", () => {
    expect(catalogoDe(espacioGrupo)).toEqual(grupo)
    expect(normalizarAccesos(null, grupo, deFabricaDe(espacioGrupo))).toEqual(DE_FABRICA_GRUPO)
    // "deudas" es personal: en un grupo no existe (lo que se deben es el balance).
    expect(normalizarAccesos(["deudas", "saldar"], grupo, DE_FABRICA_GRUPO)).toEqual(["saldar"])
    expect(agregarAcceso([], "deudas", grupo)).toEqual([])
    expect(agregarAcceso([], "metas", grupo)).toEqual(["metas"])
  })

  it("cada grupo guarda los suyos sin tocar los de otro", () => {
    const mapa = conAccesosDeGrupo({ g2: ["saldar"] }, "g1", ["calendario"])
    expect(mapa).toEqual({ g2: ["saldar"], g1: ["calendario"] })
    expect(conAccesosDeGrupo(mapa, "g1", null)).toEqual({ g2: ["saldar"] })
  })

  it("lee el mapa guardado y descarta lo que no tiene forma", () => {
    expect(mapaJson('{"g1":["saldar"],"g2":"x"}')).toEqual({ g1: ["saldar"] })
    expect(mapaJson("no-json")).toEqual({})
    expect(mapaJson('["saldar"]')).toEqual({})
    expect(mapaJson(null)).toEqual({})
  })
})
