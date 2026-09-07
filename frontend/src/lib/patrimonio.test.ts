import { describe, expect, it } from "vitest"

import { calcularPatrimonio, convertir, ultimaPorPar } from "@/lib/patrimonio"

const USD_ARS = {
  base_currency: "USD",
  quote_currency: "ARS",
  rate: "1735.1000000000",
  rate_date: "2026-09-06",
}

describe("convertir", () => {
  it("convierte a unidades menores del destino", () => {
    // 15,80 USD a 1735,10 -> 27.414,58 ARS
    expect(convertir(1580, "USD", "ARS", 1735.1)).toBe(2741458)
  })
  it("respeta el factor de cada moneda", () => {
    // 1.000 JPY (factor 1) a 12 ARS por yen -> 12.000,00 ARS
    expect(convertir(1000, "JPY", "ARS", 12)).toBe(1200000)
    // 12.000,00 ARS a 1/12 de yen por peso -> 1.000 yenes
    expect(convertir(1200000, "ARS", "JPY", 1 / 12)).toBe(1000)
  })
})

describe("calcularPatrimonio", () => {
  it("la moneda objetivo pasa tal cual", () => {
    const r = calcularPatrimonio([{ moneda: "ARS", saldo: 99200100 }], "ARS", [])
    expect(r.total).toBe(99200100)
    expect(r.sinCotizacion).toEqual([])
    // Sin conversion no hay fecha que mostrar.
    expect(r.fecha).toBeNull()
  })

  it("suma lo convertido con la cotizacion directa", () => {
    const r = calcularPatrimonio(
      [
        { moneda: "ARS", saldo: 99200100 },
        { moneda: "USD", saldo: 281851 },
      ],
      "ARS",
      [USD_ARS],
    )
    // 2.818,51 USD * 1735,10 = 4.890.396,70 ARS
    expect(r.total).toBe(99200100 + 489039670)
    expect(r.fecha).toBe("2026-09-06")
    expect(r.lineas.find((l) => l.moneda === "USD")?.inversa).toBe(false)
  })

  it("usa la cotizacion inversa si es la que hay", () => {
    // Solo existe USD->ARS y se pide el total en USD.
    const r = calcularPatrimonio(
      [
        { moneda: "USD", saldo: 100000 },
        { moneda: "ARS", saldo: 173510000 },
      ],
      "USD",
      [USD_ARS],
    )
    // 1.735.100,00 ARS / 1735,10 = 1.000,00 USD
    expect(r.total).toBe(100000 + 100000)
    expect(r.lineas.find((l) => l.moneda === "ARS")?.inversa).toBe(true)
  })

  it("lo que no tiene cotizacion queda afuera del total y se informa", () => {
    const r = calcularPatrimonio(
      [
        { moneda: "ARS", saldo: 100000 },
        { moneda: "BRL", saldo: 50000 },
      ],
      "ARS",
      [USD_ARS],
    )
    expect(r.total).toBe(100000)
    expect(r.sinCotizacion).toEqual(["BRL"])
    expect(r.lineas.find((l) => l.moneda === "BRL")?.convertido).toBeNull()
  })

  it("la fecha del total es la de la cotizacion mas vieja usada", () => {
    const r = calcularPatrimonio(
      [
        { moneda: "USD", saldo: 100000 },
        { moneda: "EUR", saldo: 100000 },
      ],
      "ARS",
      [
        USD_ARS,
        {
          base_currency: "EUR",
          quote_currency: "ARS",
          rate: "2000",
          rate_date: "2026-08-20",
        },
      ],
    )
    // El total no es mas fresco que su peor dato.
    expect(r.fecha).toBe("2026-08-20")
  })

  it("una cotizacion en cero no se usa: anularia el saldo", () => {
    const r = calcularPatrimonio([{ moneda: "USD", saldo: 100000 }], "ARS", [
      { ...USD_ARS, rate: "0" },
    ])
    expect(r.total).toBe(0)
    expect(r.sinCotizacion).toEqual(["USD"])
  })

  it("sin saldos el total es cero", () => {
    expect(calcularPatrimonio([], "ARS", [USD_ARS])).toEqual({
      total: 0,
      lineas: [],
      sinCotizacion: [],
      fecha: null,
    })
  })
})

describe("ultimaPorPar", () => {
  it("se queda con la primera de cada par (la mas nueva)", () => {
    const filas = [
      { ...USD_ARS, rate: "1735", rate_date: "2026-09-06" },
      { ...USD_ARS, rate: "1700", rate_date: "2026-09-01" },
      { base_currency: "EUR", quote_currency: "ARS", rate: "2000", rate_date: "2026-09-05" },
    ]
    const r = ultimaPorPar(filas)
    expect(r).toHaveLength(2)
    expect(r[0].rate).toBe("1735")
    expect(r[1].base_currency).toBe("EUR")
  })
})
