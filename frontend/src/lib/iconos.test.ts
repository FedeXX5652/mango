import { describe, expect, it } from "vitest"

import { GRUPOS_ICONOS, ICONOS, ICONO_POR_DEFECTO, filtrarIconos, iconoDe } from "@/lib/iconos"

describe("catalogo", () => {
  it("no repite claves", () => {
    // La clave es lo que se guarda en `categories.icon`: si se repitiera, dos
    // iconos distintos quedarian pegados al mismo valor.
    const claves = ICONOS.map((i) => i.clave)
    expect(new Set(claves).size).toBe(claves.length)
  })

  it("es un subconjunto elegible a mano, no la libreria entera", () => {
    expect(ICONOS.length).toBeGreaterThan(40)
    expect(ICONOS.length).toBeLessThan(120)
  })

  it("los grupos cubren todo el catalogo", () => {
    expect(GRUPOS_ICONOS.flatMap((g) => g.iconos).length).toBe(ICONOS.length)
  })
})

describe("iconoDe", () => {
  it("resuelve una clave conocida", () => {
    expect(iconoDe("carrito")).toBe(ICONOS.find((i) => i.clave === "carrito")?.Icono)
  })

  it("sin icono elegido cae al de por defecto", () => {
    expect(iconoDe(null)).toBe(ICONO_POR_DEFECTO)
    expect(iconoDe("")).toBe(ICONO_POR_DEFECTO)
  })

  it("una clave que ya no existe no rompe la pantalla", () => {
    // Pasa si se saca un icono del catalogo y quedan categorias apuntandolo.
    expect(iconoDe("esto-no-existe")).toBe(ICONO_POR_DEFECTO)
  })
})

describe("filtrarIconos", () => {
  it("busca por sinonimo en español, no por el nombre en ingles", () => {
    // Nadie va a buscar "Utensils".
    expect(filtrarIconos("supermercado").map((i) => i.clave)).toContain("carrito")
    expect(filtrarIconos("nafta").map((i) => i.clave)).toContain("nafta")
  })

  it("ignora tildes", () => {
    expect(filtrarIconos("panales").map((i) => i.clave)).toContain("bebe")
  })

  it("sin texto devuelve todo", () => {
    expect(filtrarIconos("   ")).toHaveLength(ICONOS.length)
  })

  it("sin coincidencias devuelve vacio", () => {
    expect(filtrarIconos("zzzz")).toEqual([])
  })
})
