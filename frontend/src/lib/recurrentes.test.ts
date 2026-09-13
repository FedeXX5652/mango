import { describe, expect, it } from "vitest"

import {
  type ReglaRecurrente,
  type ReglaSobre,
  idDeterminista,
  inicioDeMes,
  ocurrenciasPendientes,
  siguienteFecha,
  sobresPendientes,
} from "@/lib/recurrentes"

function regla(p: Partial<ReglaRecurrente> = {}): ReglaRecurrente {
  return {
    id: "r1",
    kind: "expense",
    account_id: "cuenta",
    transfer_account_id: null,
    category_id: "cat",
    payment_method_id: null,
    amount: 500000,
    currency: "ARS",
    payee: "Alquiler",
    notes: null,
    frequency: "monthly",
    interval_count: 1,
    next_run_date: "2026-08-01",
    end_date: null,
    active: 1,
    ...p,
  }
}

describe("siguienteFecha", () => {
  it("suma dias y semanas", () => {
    expect(siguienteFecha("2026-09-13", "daily", 1)).toBe("2026-09-14")
    expect(siguienteFecha("2026-09-13", "weekly", 2)).toBe("2026-09-27")
    // Cruzando fin de mes y de año.
    expect(siguienteFecha("2026-12-30", "daily", 3)).toBe("2027-01-02")
  })

  it("suma meses recortando al ultimo dia, sin arrastrar", () => {
    // El 31 de enero + 1 mes es el 28 de febrero, NO el 3 de marzo.
    expect(siguienteFecha("2026-01-31", "monthly", 1)).toBe("2026-02-28")
    expect(siguienteFecha("2028-01-31", "monthly", 1)).toBe("2028-02-29")
    expect(siguienteFecha("2026-01-31", "monthly", 3)).toBe("2026-04-30")
    expect(siguienteFecha("2026-11-15", "monthly", 2)).toBe("2027-01-15")
  })

  it("suma años, con el 29 de febrero cayendo al 28", () => {
    expect(siguienteFecha("2026-09-13", "yearly", 1)).toBe("2027-09-13")
    expect(siguienteFecha("2028-02-29", "yearly", 1)).toBe("2029-02-28")
  })

  it("recortar no se acumula: el dia sale de la fecha guardada", () => {
    // Si la regla es "el 31" y en febrero se guardara el 28, marzo caeria el 28
    // para siempre. Por eso `next_run_date` avanza desde la fecha anterior, y
    // esta prueba deja escrito que despues de febrero vuelve a ser 31.
    const feb = siguienteFecha("2026-01-31", "monthly", 1)
    expect(feb).toBe("2026-02-28")
    expect(siguienteFecha(feb, "monthly", 1)).toBe("2026-03-28")
  })
})

describe("idDeterminista", () => {
  it("misma regla y fecha dan el mismo id", () => {
    // Es lo que evita el gasto duplicado cuando dos dispositivos generan la
    // misma ocurrencia sin conexion.
    expect(idDeterminista("r1", "2026-09-01")).toBe(idDeterminista("r1", "2026-09-01"))
  })

  it("distinta fecha o distinta regla dan ids distintos", () => {
    expect(idDeterminista("r1", "2026-09-01")).not.toBe(idDeterminista("r1", "2026-10-01"))
    expect(idDeterminista("r1", "2026-09-01")).not.toBe(idDeterminista("r2", "2026-09-01"))
  })

  it("tiene forma de UUID y se declara version 8 (a medida)", () => {
    const id = idDeterminista("r1", "2026-09-01")
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })
})

describe("ocurrenciasPendientes", () => {
  it("genera una por periodo vencido y deja la proxima adelante", () => {
    const r = ocurrenciasPendientes(regla({ next_run_date: "2026-06-01" }), "2026-08-15")
    expect(r.ocurrencias.map((o) => o.fecha)).toEqual(["2026-06-01", "2026-07-01", "2026-08-01"])
    expect(r.proxima).toBe("2026-09-01")
  })

  it("si no vencio nada no genera nada", () => {
    const r = ocurrenciasPendientes(regla({ next_run_date: "2026-10-01" }), "2026-09-13")
    expect(r.ocurrencias).toEqual([])
    expect(r.proxima).toBe("2026-10-01")
  })

  it("el dia exacto cuenta como vencido", () => {
    const r = ocurrenciasPendientes(regla({ next_run_date: "2026-09-13" }), "2026-09-13")
    expect(r.ocurrencias).toHaveLength(1)
  })

  it("una regla pausada no debe nada, y su fecha no se mueve", () => {
    const r = ocurrenciasPendientes(regla({ active: 0, next_run_date: "2026-06-01" }), "2026-08-15")
    expect(r.ocurrencias).toEqual([])
    expect(r.proxima).toBe("2026-06-01")
  })

  it("no pasa de end_date", () => {
    const r = ocurrenciasPendientes(
      regla({ next_run_date: "2026-06-01", end_date: "2026-07-15" }),
      "2026-12-01",
    )
    expect(r.ocurrencias.map((o) => o.fecha)).toEqual(["2026-06-01", "2026-07-01"])
  })

  it("el movimiento queda al mediodia, para que no se corra de dia", () => {
    const [o] = ocurrenciasPendientes(
      regla({ next_run_date: "2026-09-01" }),
      "2026-09-01",
    ).ocurrencias
    const d = new Date(o.occurred_at)
    expect(d.getDate()).toBe(1)
    expect(d.getHours()).toBe(12)
  })

  it("correr dos veces da los mismos ids", () => {
    // Idempotencia: si la segunda corrida generara ids nuevos, duplicaria.
    const a = ocurrenciasPendientes(regla({ next_run_date: "2026-06-01" }), "2026-08-15")
    const b = ocurrenciasPendientes(regla({ next_run_date: "2026-06-01" }), "2026-08-15")
    expect(a.ocurrencias.map((o) => o.id)).toEqual(b.ocurrencias.map((o) => o.id))
  })
})

describe("sobresPendientes", () => {
  const sobre = (p: Partial<ReglaSobre> = {}): ReglaSobre => ({
    id: "s1",
    category_id: "comida",
    amount: 80000,
    currency: "ARS",
    active: 1,
    ...p,
  })

  it("crea el sobre del mes de la fecha pedida", () => {
    const r = sobresPendientes([sobre()], "2026-09-13", new Set())
    expect(r).toHaveLength(1)
    expect(r[0].period_start).toBe("2026-09-01")
    expect(r[0].amount).toBe(80000)
  })

  it("no pisa una asignacion que ya existe", () => {
    // Puede venir de una corrida anterior o de algo que cargo la persona.
    const r = sobresPendientes([sobre()], "2026-09-13", new Set(["comida|ARS"]))
    expect(r).toEqual([])
  })

  it("cada moneda tiene su propio sobre", () => {
    const r = sobresPendientes(
      [sobre(), sobre({ id: "s2", currency: "USD", amount: 500 })],
      "2026-09-13",
      new Set(["comida|ARS"]),
    )
    expect(r.map((s) => s.currency)).toEqual(["USD"])
  })

  it("una regla pausada no crea nada", () => {
    expect(sobresPendientes([sobre({ active: 0 })], "2026-09-13", new Set())).toEqual([])
  })

  it("dos reglas de la misma categoria y moneda crean un solo sobre", () => {
    const r = sobresPendientes([sobre(), sobre({ id: "s2" })], "2026-09-13", new Set())
    expect(r).toHaveLength(1)
  })
})

describe("inicioDeMes", () => {
  it("lleva cualquier dia al primero", () => {
    expect(inicioDeMes("2026-09-13")).toBe("2026-09-01")
    expect(inicioDeMes("2026-01-01")).toBe("2026-01-01")
  })
})
