import { describe, expect, it } from "vitest"

import { ATAJOS, destinoUltimoGrupo, tipoDesdeParametro } from "@/lib/atajos"

// Los PNG de /public, por su ruta desde la raiz del proyecto.
const PUBLICOS = import.meta.glob("/public/icons/atajos/*.png")

describe("tipo del alta desde la URL", () => {
  it("entiende los tres tipos, en castellano", () => {
    expect(tipoDesdeParametro("gasto")).toBe("expense")
    expect(tipoDesdeParametro("ingreso")).toBe("income")
    expect(tipoDesdeParametro("transferencia")).toBe("transfer")
  })

  it("tolera mayusculas y espacios", () => {
    expect(tipoDesdeParametro(" Ingreso ")).toBe("income")
  })

  it("sin tipo o con uno desconocido abre en Gasto, sin error", () => {
    expect(tipoDesdeParametro(null)).toBe("expense")
    expect(tipoDesdeParametro(undefined)).toBe("expense")
    expect(tipoDesdeParametro("expense")).toBe("expense")
    expect(tipoDesdeParametro("cualquiera")).toBe("expense")
  })
})

describe("destino del atajo 'Último grupo'", () => {
  it("va al ultimo abierto si sigue siendo mio", () => {
    expect(destinoUltimoGrupo("b", ["a", "b"])).toBe("/grupos/b")
  })

  it("si el ultimo ya no es mio y tengo uno solo, va a ese", () => {
    expect(destinoUltimoGrupo("viejo", ["a"])).toBe("/grupos/a")
  })

  it("sin ultimo y con uno solo, va a ese", () => {
    expect(destinoUltimoGrupo(null, ["a"])).toBe("/grupos/a")
  })

  it("sin ultimo valido y con varios o ninguno, va a la lista", () => {
    expect(destinoUltimoGrupo(null, ["a", "b"])).toBe("/grupos")
    expect(destinoUltimoGrupo("viejo", ["a", "b"])).toBe("/grupos")
    expect(destinoUltimoGrupo(null, [])).toBe("/grupos")
  })
})

describe("atajos del manifiesto", () => {
  it("los tres primeros son los que muestra Android: cargar y ver lo cargado", () => {
    expect(ATAJOS.slice(0, 3).map((a) => a.url)).toEqual([
      "/nuevo?tipo=gasto",
      "/nuevo?tipo=ingreso",
      "/movimientos",
    ])
  })

  it("entran en el tope de Windows (10) y no repiten nombre ni destino", () => {
    expect(ATAJOS.length).toBeLessThanOrEqual(10)
    expect(new Set(ATAJOS.map((a) => a.name)).size).toBe(ATAJOS.length)
    expect(new Set(ATAJOS.map((a) => a.url)).size).toBe(ATAJOS.length)
  })

  it("toda URL es de la app (dentro del scope '/')", () => {
    for (const a of ATAJOS) expect(a.url.startsWith("/")).toBe(true)
  })

  it("los tipos de /nuevo son los que entiende el alta", () => {
    for (const a of ATAJOS.filter((x) => x.url.startsWith("/nuevo"))) {
      const tipo = new URL(a.url, "https://mango.local").searchParams.get("tipo")
      expect(["gasto", "ingreso", "transferencia"]).toContain(tipo)
    }
  })

  it("cada icono existe en /public, en 96 y 192", () => {
    for (const a of ATAJOS) {
      expect(a.icons.map((i) => i.sizes)).toEqual(["96x96", "192x192"])
      for (const i of a.icons) expect(Object.keys(PUBLICOS)).toContain(`/public/${i.src}`)
    }
  })

  it("el nombre corto entra en el menu del launcher", () => {
    for (const a of ATAJOS) expect(a.short_name.length).toBeLessThanOrEqual(12)
  })
})
