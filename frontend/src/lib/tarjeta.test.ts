import { describe, expect, it } from "vitest"

import {
  cierreDeLaCompra,
  disponible,
  estadoTarjeta,
  noFacturado,
  repartirCuotas,
  ultimoCierre,
  vencimientoDe,
  type MovTarjeta,
} from "@/lib/tarjeta"

describe("fechas del resumen", () => {
  it("el ultimo cierre es el de este mes si ya paso, si no el del anterior", () => {
    expect(ultimoCierre("2026-10-30", 24)).toBe("2026-10-24")
    expect(ultimoCierre("2026-10-20", 24)).toBe("2026-09-24")
  })

  it("el dia del cierre ya cuenta como cerrado", () => {
    expect(ultimoCierre("2026-10-24", 24)).toBe("2026-10-24")
    expect(cierreDeLaCompra("2026-10-24", 24)).toBe("2026-10-24")
  })

  it("una compra despues del cierre entra en el resumen siguiente", () => {
    expect(cierreDeLaCompra("2026-10-25", 24)).toBe("2026-11-24")
  })

  it("un cierre el 31 cae en el ultimo dia de los meses cortos", () => {
    expect(ultimoCierre("2026-03-01", 31)).toBe("2026-02-28")
    expect(cierreDeLaCompra("2026-02-15", 31)).toBe("2026-02-28")
  })

  it("el vencimiento es el primero despues del cierre, aunque cambie el año", () => {
    expect(vencimientoDe("2026-10-24", 5)).toBe("2026-11-05")
    expect(vencimientoDe("2026-10-05", 20)).toBe("2026-10-20")
    expect(vencimientoDe("2026-12-24", 5)).toBe("2027-01-05")
  })
})

describe("repartirCuotas", () => {
  it("cuotas iguales; la primera lleva los centavos que sobran", () => {
    expect(repartirCuotas(100000, 3)).toEqual([33334, 33333, 33333])
  })

  it("una sola cuota es el total", () => {
    expect(repartirCuotas(4500, 1)).toEqual([4500])
  })

  it("montos grandes sin perder un centavo", () => {
    const cuotas = repartirCuotas(9_007_199_254_740_991, 7)
    expect(cuotas.reduce((s, c) => s + c, 0)).toBe(9_007_199_254_740_991)
  })
})

// Cierre el 24, hoy 30/10: el ultimo resumen cerro el 24/10 y vence el 5/11.
const HOY = "2026-10-30"
const compra = (fecha: string, monto: number, cuotas: number | null = null): MovTarjeta => ({
  fecha,
  efecto: -monto,
  compra: true,
  cuotas,
})
const MOVS: MovTarjeta[] = [
  compra("2026-09-10", 90000, 3), // cuotas: 24/09, 24/10 y 24/11
  compra("2026-10-20", 20000), // entro en el resumen del 24/10
  compra("2026-10-26", 95000), // entra en el del 24/11
  { fecha: "2026-10-01", efecto: 10000, compra: false, cuotas: null }, // un pago
]

describe("noFacturado", () => {
  it("cuenta las compras despues del cierre y las cuotas futuras", () => {
    // 95.000 de la compra del 26/10 + la tercera cuota (30.000).
    expect(noFacturado(MOVS, 24, HOY)).toBe(125000)
  })

  it("un pago o un ajuste no se factura por cuotas", () => {
    const ajuste: MovTarjeta = { fecha: "2026-10-28", efecto: -5000, compra: false, cuotas: null }
    expect(noFacturado([ajuste], 24, HOY)).toBe(0)
  })
})

describe("estadoTarjeta", () => {
  // Saldo de la cuenta: -90.000 -20.000 -95.000 +10.000.
  const saldo = -195000

  it("lo que vence es la deuda menos lo que todavia no se facturo", () => {
    expect(estadoTarjeta(saldo, MOVS, { cierre: 24, vence: 5 }, HOY)).toEqual({
      deuda: 195000,
      aFavor: 0,
      // 30.000 + 30.000 + 20.000 facturados, menos el pago de 10.000.
      resumen: 70000,
      cierre: "2026-10-24",
      vence: "2026-11-05",
      proximoCierre: "2026-11-24",
    })
  })

  it("sin dia de cierre solo se sabe el total", () => {
    const e = estadoTarjeta(saldo, MOVS, { cierre: null, vence: 5 }, HOY)
    expect(e.deuda).toBe(195000)
    expect(e.resumen).toBeNull()
    expect(e.vence).toBeNull()
  })

  it("con el resumen ya pagado, lo que vence es 0", () => {
    const pagado = [...MOVS, { fecha: "2026-10-29", efecto: 70000, compra: false, cuotas: null }]
    expect(estadoTarjeta(saldo + 70000, pagado, { cierre: 24, vence: 5 }, HOY).resumen).toBe(0)
  })

  it("a favor: no se debe nada", () => {
    const e = estadoTarjeta(5000, [], { cierre: 24, vence: 5 }, HOY)
    expect([e.deuda, e.aFavor, e.resumen]).toEqual([0, 5000, 0])
  })
})

describe("disponible", () => {
  it("limite menos lo que se debe en cada saldo", () => {
    expect(disponible(1000000, 300000, [200000])).toBe(500000)
  })

  it("puede pasarse: lo informa en negativo", () => {
    expect(disponible(100000, 150000, [])).toBe(-50000)
  })
})
