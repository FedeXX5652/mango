import { describe, expect, it } from "vitest"

import { aBytes, esRutaDeLaApp, nombreDispositivo } from "@/lib/push"

describe("clave publica VAPID", () => {
  it("base64url a bytes, con y sin relleno", () => {
    expect([...aBytes("AQID")]).toEqual([1, 2, 3])
    expect([...aBytes("AQIDBA")]).toEqual([1, 2, 3, 4])
    // "-" y "_" son los "+" y "/" de base64url.
    expect([...aBytes("-_8")]).toEqual([251, 255])
  })
  it("una clave real mide 65 bytes (punto sin comprimir)", () => {
    const clave =
      "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U"
    expect(aBytes(clave).length).toBe(65)
  })
})

describe("tocar un aviso", () => {
  it("lleva a rutas de la app", () => {
    expect(esRutaDeLaApp("/")).toBe(true)
    expect(esRutaDeLaApp("/grupos/abc/movimientos?mes=2026-10")).toBe(true)
  })
  it("nunca a otro sitio", () => {
    expect(esRutaDeLaApp("//otro.sitio/x")).toBe(false)
    expect(esRutaDeLaApp("/\\otro.sitio")).toBe(false)
    expect(esRutaDeLaApp("https://otro.sitio/")).toBe(false)
    expect(esRutaDeLaApp("javascript:alert(1)")).toBe(false)
    expect(esRutaDeLaApp("")).toBe(false)
    expect(esRutaDeLaApp(undefined)).toBe(false)
  })
})

describe("nombre del dispositivo", () => {
  it("navegador y sistema", () => {
    expect(
      nombreDispositivo(
        "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/129.0 Mobile Safari/537.36",
      ),
    ).toBe("Chrome en Android")
    expect(
      nombreDispositivo(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1",
      ),
    ).toBe("Safari en iPhone")
    expect(
      nombreDispositivo(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/129.0 Safari/537.36 Edg/129.0",
      ),
    ).toBe("Edge en Windows")
  })
})
