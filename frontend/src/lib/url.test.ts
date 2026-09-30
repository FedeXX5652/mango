import { describe, expect, it } from "vitest"

import { urlAbsoluta } from "@/lib/url"

describe("urlAbsoluta", () => {
  it("una ruta relativa se resuelve contra el origen de la pagina", () => {
    // Produccion: nginx sirve la PWA y hace de proxy a PowerSync (ver 0020).
    expect(urlAbsoluta("/powersync", "http://mango.tailnet.ts.net:8081")).toBe(
      "http://mango.tailnet.ts.net:8081/powersync",
    )
  })

  it("respeta https: la misma imagen detras de un proxy con TLS", () => {
    expect(urlAbsoluta("/powersync", "https://mango.ejemplo.com")).toBe(
      "https://mango.ejemplo.com/powersync",
    )
  })

  it("una URL absoluta queda como esta (desarrollo, con puertos separados)", () => {
    expect(urlAbsoluta("http://192.168.1.10:8080", "http://localhost:5173")).toBe(
      "http://192.168.1.10:8080",
    )
  })

  it("saca la barra final: el SDK la rechaza", () => {
    expect(urlAbsoluta("http://localhost:8080/", "http://localhost:5173")).toBe(
      "http://localhost:8080",
    )
    expect(urlAbsoluta("/powersync/", "http://h")).toBe("http://h/powersync")
  })

  it("vacio sigue vacio: el que llama decide el valor por defecto", () => {
    expect(urlAbsoluta("", "http://h")).toBe("")
    expect(urlAbsoluta("   ", "http://h")).toBe("")
  })
})
