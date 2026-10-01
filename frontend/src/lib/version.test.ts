import { describe, expect, it } from "vitest"

import { VERSION, textoVersion } from "@/lib/version"

describe("version de la app", () => {
  it("es SemVer", () => {
    expect(VERSION.version).toMatch(/^\d+\.\d+\.\d+$/)
  })

  it("arma el texto con version, commit y fecha", () => {
    const t = textoVersion({
      version: "1.2.3",
      commit: "abc1234",
      compilada: "2026-10-01T12:00:00Z",
    })
    expect(t).toBe("Mango 1.2.3 · abc1234 · 01/10/2026")
  })

  it("lo que no se sabe no se muestra", () => {
    expect(textoVersion({ version: "1.2.3", commit: "", compilada: "" })).toBe("Mango 1.2.3")
  })
})
