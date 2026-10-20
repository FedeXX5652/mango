import { describe, expect, it } from "vitest"

import {
  type Conversor,
  type FilaCotizacion,
  SIN_PREFERENCIAS,
  conversor,
  indexar,
} from "@/lib/cotizaciones"
import { calcularPatrimonio, convertir } from "@/lib/patrimonio"

// Las filas de estas pruebas son cargadas a mano (como todas antes de la 1.7.0):
// la busqueda de lo cargado a mano es la de siempre, directa, inversa o
// compuesta por una tercera moneda. La serie automatica contra el dolar se
// prueba en cotizaciones.test.ts.
function conv(filas: Omit<FilaCotizacion, "source" | "casa">[]): Conversor {
  return conversor(
    indexar(filas.map((f) => ({ source: "manual", casa: null, ...f }))),
    SIN_PREFERENCIAS,
  )
}

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
    const r = calcularPatrimonio([{ moneda: "ARS", saldo: 99200100 }], "ARS", conv([]))
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
      conv([USD_ARS]),
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
      conv([USD_ARS]),
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
      conv([USD_ARS]),
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
      conv([
        USD_ARS,
        {
          base_currency: "EUR",
          quote_currency: "ARS",
          rate: "2000",
          rate_date: "2026-08-20",
        },
      ]),
    )
    // El total no es mas fresco que su peor dato.
    expect(r.fecha).toBe("2026-08-20")
  })

  it("una cotizacion en cero no se usa: anularia el saldo", () => {
    const r = calcularPatrimonio(
      [{ moneda: "USD", saldo: 100000 }],
      "ARS",
      conv([{ ...USD_ARS, rate: "0" }]),
    )
    expect(r.total).toBe(0)
    expect(r.sinCotizacion).toEqual(["USD"])
  })

  it("sin saldos el total es cero", () => {
    expect(calcularPatrimonio([], "ARS", conv([USD_ARS]))).toEqual({
      total: 0,
      lineas: [],
      sinCotizacion: [],
      fecha: null,
    })
  })
})

describe("los flujos usan la misma cotizacion que el patrimonio", () => {
  // La tarjeta de resumen contesta "cuanto tengo y como vino el mes, en esta
  // moneda, hoy": una sola cotizacion para todo, como si cambiaras ahora. Por
  // eso los flujos pasan por `calcularPatrimonio` y no hay conversion por
  // fecha (la del momento de cada movimiento es para los informes historicos,
  // ver 0005).
  const ultimas = [
    { base_currency: "USD", quote_currency: "ARS", rate: "1500.00", rate_date: "2026-09-06" },
  ]

  it("un ingreso viejo se convierte con la ultima cotizacion, no con la de su dia", () => {
    const r = calcularPatrimonio([{ moneda: "USD", saldo: 50000 }], "ARS", conv(ultimas))
    expect(r.total).toBe(75000000)
    expect(r.fecha).toBe("2026-09-06")
  })

  it("una moneda sin ninguna cotizacion queda afuera y se informa", () => {
    const r = calcularPatrimonio(
      [
        { moneda: "ARS", saldo: 100000000 },
        { moneda: "BRL", saldo: 50000 },
      ],
      "ARS",
      conv(ultimas),
    )
    expect(r.total).toBe(100000000)
    expect(r.sinCotizacion).toEqual(["BRL"])
  })
})

// Cargadas a mano contra la base: el par USD/MXN no esta y hay que componerlo.
const CONTRA_ARS = [
  { base_currency: "USD", quote_currency: "ARS", rate: "1509.9100000000", rate_date: "2026-09-12" },
  { base_currency: "MXN", quote_currency: "ARS", rate: "88.9600000000", rate_date: "2026-09-12" },
]

describe("compuesta, con lo cargado a mano", () => {
  it("compone por la base cuando el par no existe", () => {
    // 1 USD = 1509,91 ARS y 1 MXN = 88,96 ARS -> 1 USD = 16,97 MXN.
    const r = conv(CONTRA_ARS)("USD", "MXN")
    expect(r?.rate).toBeCloseTo(1509.91 / 88.96, 10)
    expect(r?.via).toBe("ARS")
  })

  it("el par directo le gana al compuesto", () => {
    const r = conv(CONTRA_ARS)("USD", "ARS")
    expect(r?.rate).toBe(1509.91)
    expect(r?.via).toBeNull()
  })

  it("la fecha es la mas vieja de las dos patas", () => {
    // El resultado no puede ser mas fresco que su peor insumo.
    const viejo = [CONTRA_ARS[0], { ...CONTRA_ARS[1], rate_date: "2026-09-08" }]
    expect(conv(viejo)("USD", "MXN")?.fecha).toBe("2026-09-08")
  })

  it("entre dos cadenas gana la del eslabon debil mas nuevo", () => {
    const dos = [
      ...CONTRA_ARS,
      {
        base_currency: "USD",
        quote_currency: "EUR",
        rate: "0.9000000000",
        rate_date: "2026-01-01",
      },
      {
        base_currency: "EUR",
        quote_currency: "MXN",
        rate: "20.0000000000",
        rate_date: "2026-01-01",
      },
    ]
    // Por EUR daria 18 y es de enero; por ARS es de septiembre.
    const r = conv(dos)("USD", "MXN")
    expect(r?.via).toBe("ARS")
    expect(r?.fecha).toBe("2026-09-12")
  })

  it("respeta `hasta` en las DOS patas", () => {
    const mezcla = [CONTRA_ARS[0], { ...CONTRA_ARS[1], rate_date: "2026-09-20" }]
    // La pata MXN es posterior al corte: la cadena no cierra.
    expect(conv(mezcla)("USD", "MXN", "2026-09-15")).toBeNull()
  })

  it("sin cadena posible devuelve null", () => {
    expect(conv(CONTRA_ARS)("USD", "BRL")).toBeNull()
  })
})

describe("patrimonio con cotizacion compuesta", () => {
  it("leido en dolares, los pesos mexicanos ya no quedan afuera", () => {
    // Era el bug: con base ARS, leer el patrimonio en USD dejaba MXN sin
    // convertir por un dato que ya estaba guardado.
    const r = calcularPatrimonio(
      [
        { moneda: "USD", saldo: 100000 },
        { moneda: "MXN", saldo: 100000 },
      ],
      "USD",
      conv(CONTRA_ARS),
    )
    expect(r.sinCotizacion).toEqual([])
    // 1.000,00 MXN * (88,96 / 1509,91) = 58,92 USD
    expect(r.total).toBe(100000 + 5892)
  })
})
