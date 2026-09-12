import { describe, expect, it } from "vitest"

import { cotizacionDe, cotizacionLegible, montoCuentaDe } from "@/lib/conversion"

describe("los dos caminos no dan lo mismo", () => {
  it("del monto debitado sale una cotizacion con decimales", () => {
    // 15,80 USD que el banco debito como 27.412,60 pesos.
    expect(cotizacionDe(1580, "USD", 2741260, "ARS")).toBe("1734.9746835443")
  })
  it("de la cotizacion redonda sale otro monto: casi dos pesos mas", () => {
    expect(montoCuentaDe(1580, "USD", 1735.1, "ARS")).toBe(2741458)
    // 27.414,58 contra 27.412,60: la diferencia que desajusta el saldo.
    expect(2741458 - 2741260).toBe(198)
  })
  it("van y vuelven: la cotizacion deducida reproduce el monto", () => {
    const cot = cotizacionDe(1580, "USD", 2741260, "ARS")
    expect(montoCuentaDe(1580, "USD", Number(cot), "ARS")).toBe(2741260)
  })
})

describe("monedas sin decimales", () => {
  it("el yen no se divide por cien", () => {
    // 1.000 yenes a 12 pesos por yen son 12.000,00 pesos.
    expect(montoCuentaDe(1000, "JPY", 12, "ARS")).toBe(1200000)
    expect(cotizacionDe(1000, "JPY", 1200000, "ARS")).toBe("12")
  })
})

describe("valores invalidos", () => {
  it("no inventa nada con cero o negativos", () => {
    expect(cotizacionDe(0, "USD", 100, "ARS")).toBeNull()
    expect(cotizacionDe(100, "USD", 0, "ARS")).toBeNull()
    expect(montoCuentaDe(0, "USD", 1735, "ARS")).toBeNull()
    expect(montoCuentaDe(100, "USD", 0, "ARS")).toBeNull()
  })
})

describe("formato de la cotizacion", () => {
  it("sin ceros de relleno", () => {
    expect(cotizacionDe(100, "USD", 173510, "ARS")).toBe("1735.1")
  })
  it("no pasa de diez decimales, que es la escala de la columna", () => {
    const cot = cotizacionDe(300, "USD", 100000, "ARS") ?? ""
    expect((cot.split(".")[1] ?? "").length).toBeLessThanOrEqual(10)
  })
})

describe("cotizacionLegible", () => {
  it("usa el separador decimal local y corta la cola", () => {
    // Diez decimales en pantalla no dicen nada: el dato exacto es el monto.
    expect(cotizacionLegible("1734.9746835443")).toBe("1.734,9747")
    expect(cotizacionLegible("1735.1")).toBe("1.735,1")
  })

  it("con cotizaciones chicas deja mas decimales", () => {
    // Con cuatro, 1 ARS = 0,0006 USD perderia lo poco que dice.
    expect(cotizacionLegible("0.000576")).toBe("0,000576")
  })

  it("no rompe con un valor que no es numero", () => {
    expect(cotizacionLegible("")).toBe("0")
    expect(cotizacionLegible("nada")).toBe("nada")
  })
})
