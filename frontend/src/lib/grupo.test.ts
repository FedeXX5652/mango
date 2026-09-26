import { describe, expect, it } from "vitest"

import { resumenGrupo, type MiembroGrupo, type TxGrupo } from "@/lib/grupo"

const ANA: MiembroGrupo = { user_id: "aaa", nombre: "Ana" }
const BETO: MiembroGrupo = { user_id: "bbb", nombre: "Beto" }

let n = 0
function gasto(over: Partial<TxGrupo> = {}): TxGrupo {
  return {
    id: `tx${n++}`,
    owner_id: "aaa",
    amount: 10000,
    currency: "ARS",
    category_id: "cat1",
    kind: "expense",
    ...over,
  }
}

describe("resumen del grupo", () => {
  it("suma el total y desglosa por categoria y por miembro", () => {
    const r = resumenGrupo(
      [
        gasto({ owner_id: "aaa", amount: 30000, category_id: "super" }),
        gasto({ owner_id: "bbb", amount: 10000, category_id: "nafta" }),
        gasto({ owner_id: "bbb", amount: 20000, category_id: "super" }),
      ],
      [ANA, BETO],
    )[0]
    expect(r.total).toBe(60000)
    // Super (30000+20000=50000) antes que nafta (10000).
    expect(r.porCategoria).toEqual([
      { category_id: "super", total: 50000 },
      { category_id: "nafta", total: 10000 },
    ])
    // Beto puso 30000, Ana 30000.
    expect(r.porMiembro.find((m) => m.user_id === "bbb")?.total).toBe(30000)
    expect(r.porMiembro.find((m) => m.user_id === "aaa")?.total).toBe(30000)
  })

  it("reparte en partes iguales: si cada uno puso lo mismo, nadie debe", () => {
    const r = resumenGrupo(
      [gasto({ owner_id: "aaa", amount: 30000 }), gasto({ owner_id: "bbb", amount: 30000 })],
      [ANA, BETO],
    )[0]
    expect(r.balances.every((b) => b.neto === 0)).toBe(true)
    expect(r.liquidaciones).toEqual([])
  })

  it("el que puso todo queda acreedor y el otro le debe la mitad", () => {
    const r = resumenGrupo([gasto({ owner_id: "aaa", amount: 40000 })], [ANA, BETO])[0]
    const ana = r.balances.find((b) => b.user_id === "aaa")!
    const beto = r.balances.find((b) => b.user_id === "bbb")!
    expect(ana.neto).toBe(20000) // puso 40000, le tocaba 20000
    expect(beto.neto).toBe(-20000) // no puso nada, le toca 20000
    expect(r.liquidaciones).toEqual([{ de: "bbb", a: "aaa", monto: 20000 }])
  })

  it("el balance cierra en cero aunque el total no sea divisible", () => {
    // 10001 entre 2: partes 5001 y 5000, suman 10001.
    const r = resumenGrupo([gasto({ owner_id: "aaa", amount: 10001 })], [ANA, BETO])[0]
    expect(r.balances.reduce((s, b) => s + b.neto, 0)).toBe(0)
    expect(r.balances.reduce((s, b) => s + b.parte, 0)).toBe(10001)
  })

  it("separa por moneda: no mezcla pesos con dolares", () => {
    const r = resumenGrupo(
      [
        gasto({ currency: "ARS", amount: 50000 }),
        gasto({ currency: "USD", amount: 3000 }),
      ],
      [ANA, BETO],
    )
    expect(r.map((m) => m.currency)).toEqual(["ARS", "USD"])
    expect(r.find((m) => m.currency === "USD")?.total).toBe(3000)
  })

  it("ignora ingresos: solo cuenta gastos", () => {
    const r = resumenGrupo(
      [gasto({ amount: 10000, kind: "expense" }), gasto({ amount: 99999, kind: "income" })],
      [ANA, BETO],
    )
    expect(r[0].total).toBe(10000)
  })
})

describe("splits desiguales", () => {
  it("usa las partes del split en vez de partes iguales", () => {
    // Ana pago 10000, pero el reparto es 70/30 (no 50/50).
    const tx = gasto({ id: "txA", owner_id: "aaa", amount: 10000 })
    const r = resumenGrupo([tx], [ANA, BETO], {
      splits: [
        { transaction_id: "txA", user_id: "aaa", amount: 7000 },
        { transaction_id: "txA", user_id: "bbb", amount: 3000 },
      ],
    })[0]
    const ana = r.balances.find((b) => b.user_id === "aaa")!
    const beto = r.balances.find((b) => b.user_id === "bbb")!
    expect(ana.parte).toBe(7000)
    expect(beto.parte).toBe(3000)
    // Ana puso 10000, le tocaba 7000 -> le deben 3000; Beto debe 3000.
    expect(ana.neto).toBe(3000)
    expect(r.liquidaciones).toEqual([{ de: "bbb", a: "aaa", monto: 3000 }])
  })

  it("un gasto sin split cae a partes iguales aunque otro tenga split", () => {
    const r = resumenGrupo(
      [
        gasto({ id: "t1", owner_id: "aaa", amount: 10000 }), // igual
        gasto({ id: "t2", owner_id: "aaa", amount: 10000 }), // split
      ],
      [ANA, BETO],
      { splits: [{ transaction_id: "t2", user_id: "aaa", amount: 10000 }] },
    )[0]
    // t1: 5000 c/u. t2: todo Ana. Parte Ana=15000, Beto=5000.
    expect(r.balances.find((b) => b.user_id === "aaa")!.parte).toBe(15000)
    expect(r.balances.find((b) => b.user_id === "bbb")!.parte).toBe(5000)
  })
})

describe("cuenta conjunta", () => {
  it("un gasto de la cuenta conjunta suma al total pero no genera deuda", () => {
    const r = resumenGrupo(
      [
        gasto({ owner_id: "aaa", amount: 40000, paid_from_group: 1 }), // conjunta
        gasto({ owner_id: "aaa", amount: 10000 }), // personal de Ana
      ],
      [ANA, BETO],
    )[0]
    // Total incluye ambos.
    expect(r.total).toBe(50000)
    // Balance solo mira el gasto personal (10000): Beto debe 5000 a Ana.
    expect(r.liquidaciones).toEqual([{ de: "bbb", a: "aaa", monto: 5000 }])
  })

  it("si todo se paga con la conjunta, nadie debe nada", () => {
    const r = resumenGrupo(
      [gasto({ owner_id: "aaa", amount: 40000, paid_from_group: 1 })],
      [ANA, BETO],
    )[0]
    expect(r.total).toBe(40000)
    expect(r.liquidaciones).toEqual([])
    expect(r.balances.every((b) => b.neto === 0)).toBe(true)
  })
})

describe("pagos (settlements)", () => {
  it("un pago salda la deuda y la sugerencia desaparece", () => {
    const tx = gasto({ id: "txA", owner_id: "aaa", amount: 40000 }) // Beto debe 20000
    const r = resumenGrupo([tx], [ANA, BETO], {
      settlements: [{ from_user_id: "bbb", to_user_id: "aaa", amount: 20000, currency: "ARS" }],
    })[0]
    expect(r.balances.every((b) => b.neto === 0)).toBe(true)
    expect(r.liquidaciones).toEqual([])
  })

  it("un pago parcial deja el resto pendiente", () => {
    const tx = gasto({ id: "txA", owner_id: "aaa", amount: 40000 }) // Beto debe 20000
    const r = resumenGrupo([tx], [ANA, BETO], {
      settlements: [{ from_user_id: "bbb", to_user_id: "aaa", amount: 12000, currency: "ARS" }],
    })[0]
    expect(r.liquidaciones).toEqual([{ de: "bbb", a: "aaa", monto: 8000 }])
  })

  it("escenario demo: Beto le debe a Yo y al saldar queda en cero", () => {
    // Yo puso 15.300,75 (super); Beto 8.200 (nafta) + 4.300,50 (super).
    const YO = { user_id: "00000000-0000-0000-0000-000000000001", nombre: "Yo" }
    const BETO = { user_id: "00000000-0000-0000-0000-000000000002", nombre: "Beto" }
    const txs = [
      gasto({ id: "d1", owner_id: YO.user_id, amount: 1530075 }),
      gasto({ id: "d2", owner_id: BETO.user_id, amount: 820000 }),
      gasto({ id: "d3", owner_id: BETO.user_id, amount: 430050 }),
    ]
    const sinPago = resumenGrupo(txs, [YO, BETO])[0]
    expect(sinPago.liquidaciones).toEqual([
      { de: BETO.user_id, a: YO.user_id, monto: 140012 },
    ])
    // Al saldar ese monto exacto, nadie debe nada.
    const conPago = resumenGrupo(txs, [YO, BETO], {
      settlements: [
        { from_user_id: BETO.user_id, to_user_id: YO.user_id, amount: 140012, currency: "ARS" },
      ],
    })[0]
    expect(conPago.liquidaciones).toEqual([])
    expect(conPago.balances.every((b) => b.neto === 0)).toBe(true)
  })

  it("un pago en otra moneda no afecta el balance en pesos", () => {
    const tx = gasto({ id: "txA", owner_id: "aaa", amount: 40000, currency: "ARS" })
    const r = resumenGrupo([tx], [ANA, BETO], {
      settlements: [{ from_user_id: "bbb", to_user_id: "aaa", amount: 20000, currency: "USD" }],
    })[0]
    expect(r.liquidaciones).toEqual([{ de: "bbb", a: "aaa", monto: 20000 }])
  })
})
