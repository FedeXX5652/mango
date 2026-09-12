import { describe, expect, it } from "vitest"

import { convertirMovimiento, convertirTodos } from "@/lib/historico"
import { type CotizacionConocida, buscarCotizacion } from "@/lib/patrimonio"

// La serie, como la devuelve la consulta: de la fecha mas nueva a la mas vieja.
const SERIE: CotizacionConocida[] = [
  { base_currency: "USD", quote_currency: "ARS", rate: "1735.1000000000", rate_date: "2026-09-06" },
  { base_currency: "USD", quote_currency: "ARS", rate: "1200.0000000000", rate_date: "2026-03-10" },
  { base_currency: "USD", quote_currency: "ARS", rate: "1000.0000000000", rate_date: "2026-01-05" },
]

function mov(p: Partial<Parameters<typeof convertirMovimiento>[0]> = {}) {
  return {
    amount: 1580,
    currency: "USD",
    occurred_at: "2026-03-11T14:20:00.000Z",
    amount_account: null,
    moneda_cuenta: "ARS",
    ...p,
  }
}

describe("buscarCotizacion con fecha", () => {
  it("toma la ultima anterior o igual, no la mas nueva de todas", () => {
    // El error que se quiere evitar: convertir marzo con el dolar de septiembre.
    expect(buscarCotizacion("USD", "ARS", SERIE, "2026-03-11")?.rate).toBe(1200)
    expect(buscarCotizacion("USD", "ARS", SERIE)?.rate).toBe(1735.1)
  })

  it("una cotizacion del mismo dia entra, aunque `hasta` traiga la hora", () => {
    expect(buscarCotizacion("USD", "ARS", SERIE, "2026-03-10T23:59:00.000Z")?.fecha).toBe(
      "2026-03-10",
    )
  })

  it("sin ninguna anterior devuelve null, no la mas vieja", () => {
    // Un movimiento previo a toda la serie no se convierte: no hay dato.
    expect(buscarCotizacion("USD", "ARS", SERIE, "2025-12-31")).toBeNull()
  })

  it("la inversa tambien respeta la fecha", () => {
    const r = buscarCotizacion("ARS", "USD", SERIE, "2026-03-11")
    expect(r?.inversa).toBe(true)
    expect(r?.rate).toBeCloseTo(1 / 1200, 12)
  })
})

describe("convertirMovimiento", () => {
  it("si ya esta en la moneda pedida no convierte nada", () => {
    const r = convertirMovimiento(mov({ currency: "ARS", amount: 100000 }), "ARS", [])
    expect(r).toEqual({ centavos: 100000, fuente: "propia", fecha: null })
  })

  it("manda el monto debitado: es lo que cobraron de verdad", () => {
    // 15,80 USD que el banco cobro a 1734,9747 y no a los 1200 de la serie.
    const r = convertirMovimiento(mov({ amount_account: 2741260 }), "ARS", SERIE)
    expect(r).toEqual({ centavos: 2741260, fuente: "movimiento", fecha: null })
  })

  it("sin monto debitado cae a la serie, con la cotizacion del dia", () => {
    const r = convertirMovimiento(mov(), "ARS", SERIE)
    // 15,80 USD a 1200 -> 18.960,00 ARS
    expect(r).toEqual({ centavos: 1896000, fuente: "serie", fecha: "2026-03-10" })
  })

  it("el monto debitado no sirve si la cuenta esta en otra moneda", () => {
    // Compra en USD debitada de una cuenta en euros, total pedido en pesos: esos
    // centavos son euros, sumarlos como pesos seria un disparate.
    const r = convertirMovimiento(mov({ moneda_cuenta: "EUR", amount_account: 1450 }), "ARS", SERIE)
    expect(r?.fuente).toBe("serie")
    expect(r?.centavos).toBe(1896000)
  })

  it("sin cotizacion a esa fecha no inventa: devuelve null", () => {
    expect(
      convertirMovimiento(mov({ occurred_at: "2025-06-01T10:00:00.000Z" }), "ARS", SERIE),
    ).toBeNull()
    expect(convertirMovimiento(mov({ currency: "BRL" }), "ARS", SERIE)).toBeNull()
  })

  it("no se marea con minusculas ni espacios", () => {
    const r = convertirMovimiento(mov({ currency: " usd " }), " ars ", SERIE)
    expect(r?.centavos).toBe(1896000)
  })
})

describe("convertirTodos", () => {
  it("junta las monedas que quedaron afuera, sin repetir y ordenadas", () => {
    const r = convertirTodos(
      [
        mov({ amount_account: 2741260 }),
        mov({ currency: "BRL" }),
        mov({ currency: "BRL", amount: 500 }),
        mov({ currency: "JPY" }),
      ],
      "ARS",
      SERIE,
    )
    expect(r.sinCotizacion).toEqual(["BRL", "JPY"])
    // Las que no se pudieron convertir quedan en null, no en cero: cero se
    // sumaria sin que nadie se entere.
    expect(r.filas.map((f) => f.convertido)).toEqual([2741260, null, null, null])
  })

  it("sin nada que dejar afuera no informa nada", () => {
    const r = convertirTodos([mov({ amount_account: 2741260 })], "ARS", SERIE)
    expect(r.sinCotizacion).toEqual([])
  })
})
