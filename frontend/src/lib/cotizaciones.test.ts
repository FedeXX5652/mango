import { describe, expect, it } from "vitest"

import {
  type FilaCotizacion,
  type PreferenciasFx,
  SIN_PREFERENCIAS,
  aDia,
  cotizar,
  cotizarConDolar,
  dolaresDelDia,
  indexar,
  serieDiaria,
} from "@/lib/cotizaciones"

function auto(
  base: string,
  quote: string,
  fecha: string,
  rate: number,
  casa: string | null = null,
) {
  return {
    base_currency: base,
    quote_currency: quote,
    rate: String(rate),
    rate_date: fecha,
    source: "auto",
    casa,
  }
}

function mano(
  base: string,
  quote: string,
  fecha: string,
  rate: number,
  source = "manual",
): FilaCotizacion {
  return {
    base_currency: base,
    quote_currency: quote,
    rate: String(rate),
    rate_date: fecha,
    source,
    casa: null,
  }
}

// Lo que deja el servidor (0031): los cuatro dolares contra el peso y el resto
// contra el dolar.
const SERIE: FilaCotizacion[] = [
  auto("USD", "ARS", "2026-10-09", 1540, "oficial"),
  auto("USD", "ARS", "2026-10-12", 1535, "oficial"),
  auto("USD", "ARS", "2026-10-09", 1542.7, "mep"),
  auto("USD", "ARS", "2026-10-12", 1542.9, "mep"),
  auto("USD", "ARS", "2026-10-12", 1995.5, "tarjeta"),
  auto("USD", "ARS", "2026-10-12", 1560, "blue"),
  auto("USD", "EUR", "2026-10-09", 0.89238),
  auto("USD", "EUR", "2026-10-12", 0.89437),
]

const prefs = (p: Partial<PreferenciasFx>): PreferenciasFx => ({ ...SIN_PREFERENCIAS, ...p })

describe("la serie contra el dolar (0031)", () => {
  const ind = indexar(SERIE)

  it("el dolar por defecto es el MEP", () => {
    const r = cotizar("USD", "ARS", ind, SIN_PREFERENCIAS)
    expect(r).toMatchObject({ rate: 1542.9, fecha: "2026-10-12", casa: "mep", manual: false })
  })

  it("cada moneda se convierte a pesos con su dolar", () => {
    const p = prefs({ dolar: { USD: "oficial", EUR: "tarjeta" } })
    expect(cotizar("USD", "ARS", ind, p)?.rate).toBe(1535)
    // 1 EUR = (1 / 0,89437) USD, y cada dolar a 1995,5 (tarjeta).
    const eur = cotizar("EUR", "ARS", ind, p)
    expect(eur?.rate).toBeCloseTo(1995.5 / 0.89437, 8)
    expect(eur).toMatchObject({ casa: "tarjeta", via: "USD" })
  })

  it("de pesos a otra moneda decide el dolar de esa moneda", () => {
    // Con base USD y una cuenta en pesos: 1 ARS = 1 / blue USD.
    const r = cotizar("ARS", "USD", ind, prefs({ dolar: { USD: "blue" } }))
    expect(r?.rate).toBeCloseTo(1 / 1560, 12)
    expect(r?.casa).toBe("blue")
  })

  it("sin el peso de por medio no hace falta ningun dolar", () => {
    const r = cotizar("EUR", "USD", ind, SIN_PREFERENCIAS)
    expect(r?.rate).toBeCloseTo(1 / 0.89437, 12)
    expect(r?.casa).toBeNull()
  })

  it("a una fecha toma lo ultimo anterior o igual", () => {
    // El 10/10 no hay dato: vale el del 09/10.
    const r = cotizar("USD", "ARS", ind, SIN_PREFERENCIAS, "2026-10-10")
    expect(r).toMatchObject({ rate: 1542.7, fecha: "2026-10-09" })
    expect(cotizar("USD", "ARS", ind, SIN_PREFERENCIAS, "2026-10-01")).toBeNull()
  })

  it("si el dolar elegido no tiene dato a esa fecha, usa el oficial", () => {
    // La tarjeta empieza el 12/10 en esta serie (el MEP real empieza en 2018).
    const r = cotizar("USD", "ARS", ind, prefs({ dolar: { USD: "tarjeta" } }), "2026-10-10")
    expect(r).toMatchObject({ rate: 1540, casa: "oficial" })
  })

  it("la fecha de una compuesta es la de su pata mas vieja", () => {
    const solo = indexar([...SERIE, auto("USD", "ARS", "2026-10-13", 1550, "mep")])
    expect(cotizar("EUR", "ARS", solo, SIN_PREFERENCIAS)?.fecha).toBe("2026-10-12")
  })
})

describe("lo cargado a mano", () => {
  it("gana en su fecha y a igual fecha", () => {
    const ind = indexar([...SERIE, mano("USD", "ARS", "2026-10-09", 1600)])
    // El 10/10 las dos son del 09/10: gana la cargada a mano.
    expect(cotizar("USD", "ARS", ind, SIN_PREFERENCIAS, "2026-10-10")).toMatchObject({
      rate: 1600,
      manual: true,
    })
    // Despues, la automatica es mas nueva.
    expect(cotizar("USD", "ARS", ind, SIN_PREFERENCIAS)?.rate).toBe(1542.9)
  })

  it("las de antes de la 1.7.0, con su etiqueta, cuentan como cargadas a mano", () => {
    const ind = indexar([...SERIE, mano("USD", "ARS", "2026-10-12", 1601, "mep")])
    expect(cotizar("USD", "ARS", ind, SIN_PREFERENCIAS)).toMatchObject({ rate: 1601, manual: true })
  })

  it("una moneda a mano usa solo lo cargado a mano, aunque sea mas viejo", () => {
    const ind = indexar([...SERIE, mano("USD", "ARS", "2026-10-01", 1400)])
    expect(cotizar("USD", "ARS", ind, prefs({ manuales: ["USD"] }))?.rate).toBe(1400)
    // Sin nada cargado no se convierte: no se cae a la automatica.
    expect(cotizar("EUR", "ARS", ind, prefs({ manuales: ["EUR"] }))).toBeNull()
  })

  it("a igual fecha queda la ultima que se cargo", () => {
    const ind = indexar([
      { ...mano("USD", "ARS", "2026-10-12", 1700), created_at: "2026-10-12T10:00:00Z" },
      { ...mano("USD", "ARS", "2026-10-12", 1750), created_at: "2026-10-12T11:00:00Z" },
    ])
    expect(cotizar("USD", "ARS", ind, SIN_PREFERENCIAS)?.rate).toBe(1750)
  })
})

describe("fechas", () => {
  it("el instante de un movimiento se lleva al dia local", () => {
    // Un gasto de las 22 del 31 usa la cotizacion del 31, no la del 1.
    expect(aDia(new Date(2026, 2, 31, 22, 0).toISOString())).toBe("2026-03-31")
    expect(aDia("2026-03-31")).toBe("2026-03-31")
  })
})

describe("para la pantalla", () => {
  const ind = indexar(SERIE)

  it("comparar los dolares mira solo la serie automatica", () => {
    // Con una cargada a mano para hoy, la comparacion igual dice cuanto da cada
    // dolar.
    const conMano = indexar([...SERIE, mano("USD", "ARS", "2026-10-12", 1600)])
    expect(cotizarConDolar("USD", "ARS", conMano, "blue")?.rate).toBe(1560)
    expect(cotizarConDolar("EUR", "ARS", conMano, "tarjeta")?.rate).toBeCloseTo(1995.5 / 0.89437, 8)
  })

  it("los cuatro dolares del dia, en orden", () => {
    expect(dolaresDelDia(ind).map((d) => [d.casa, d.rate])).toEqual([
      ["oficial", 1535],
      ["mep", 1542.9],
      ["blue", 1560],
      ["tarjeta", 1995.5],
    ])
  })

  it("la serie diaria repite lo ultimo conocido y no inventa antes del primero", () => {
    const s = serieDiaria("USD", "ARS", ind, SIN_PREFERENCIAS, "2026-10-08", "2026-10-12")
    expect(s).toEqual([
      { fecha: "2026-10-09", rate: 1542.7 },
      { fecha: "2026-10-10", rate: 1542.7 },
      { fecha: "2026-10-11", rate: 1542.7 },
      { fecha: "2026-10-12", rate: 1542.9 },
    ])
  })
})
