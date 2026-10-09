import { describe, expect, it } from "vitest"

import {
  type ReglaRecurrente,
  type ReglaSobre,
  fechasDeRegla,
  idDeterminista,
  inicioDeMes,
  ocurrenciasPendientes,
  recurrentesQueVienen,
  siguienteDeRegla,
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
    start_date: "2026-08-01",
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

  it("con ancla, el mes siguiente vuelve al dia de la regla", () => {
    expect(siguienteFecha("2026-02-28", "monthly", 1, 31)).toBe("2026-03-31")
    expect(siguienteFecha("2026-03-31", "monthly", 1, 31)).toBe("2026-04-30")
    expect(siguienteFecha("2029-02-28", "yearly", 3, 29)).toBe("2032-02-29")
  })
})

describe("el dia de la regla no se pierde en un mes corto (1.6.0)", () => {
  // Antes el dia salia de la fecha anterior: una regla del 31 pasaba al 28 de
  // febrero y se quedaba en el 28 para siempre. Ahora sale de `start_date`.
  it("una regla del 31 vuelve al 31 despues de febrero", () => {
    const r = ocurrenciasPendientes(
      regla({ start_date: "2026-01-31", next_run_date: "2026-01-31" }),
      "2026-05-31",
    )
    expect(r.ocurrencias.map((o) => o.fecha)).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
      "2026-05-31",
    ])
    expect(r.proxima).toBe("2026-06-30")
  })

  it("una que ya habia quedado en el 28 se arregla en la siguiente", () => {
    // La fecha guardada se respeta (puede venir de otro dispositivo); la que
    // sigue ya vuelve al dia de la regla.
    const r = ocurrenciasPendientes(
      regla({ start_date: "2026-01-31", next_run_date: "2026-03-28" }),
      "2026-04-30",
    )
    expect(r.ocurrencias.map((o) => o.fecha)).toEqual(["2026-03-28", "2026-04-30"])
    expect(r.proxima).toBe("2026-05-31")
  })

  it("una anual del 29 de febrero vuelve al 29 en los bisiestos", () => {
    const r = ocurrenciasPendientes(
      regla({ frequency: "yearly", start_date: "2028-02-29", next_run_date: "2028-02-29" }),
      "2032-12-31",
    )
    expect(r.ocurrencias.map((o) => o.fecha)).toEqual([
      "2028-02-29",
      "2029-02-28",
      "2030-02-28",
      "2031-02-28",
      "2032-02-29",
    ])
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

describe("lo que viene (calendario de pagos)", () => {
  it("las fechas entre dos dias, desde la proxima y sin pasar del fin", () => {
    const r = regla({ frequency: "weekly", start_date: "2026-10-05", next_run_date: "2026-10-12" })
    expect(fechasDeRegla(r, "2026-10-08", "2026-11-01")).toEqual([
      "2026-10-12",
      "2026-10-19",
      "2026-10-26",
    ])
    expect(fechasDeRegla({ ...r, end_date: "2026-10-20" }, "2026-10-08", "2026-11-01")).toEqual([
      "2026-10-12",
      "2026-10-19",
    ])
    // Pausada: nada.
    expect(fechasDeRegla({ ...r, active: 0 }, "2026-10-08", "2026-11-01")).toEqual([])
  })

  it("la siguiente fecha desde un dia, o null si termino", () => {
    const r = regla({ frequency: "yearly", start_date: "2026-03-10", next_run_date: "2027-03-10" })
    expect(siguienteDeRegla(r, "2026-11-08")).toBe("2027-03-10")
    expect(siguienteDeRegla(r, "2027-03-11")).toBe("2028-03-10")
    expect(siguienteDeRegla({ ...r, end_date: "2027-12-31" }, "2027-03-11")).toBeNull()
    expect(siguienteDeRegla({ ...r, active: 0 }, "2026-11-08")).toBeNull()
  })

  it("se reparte como el calendario: hoy, los proximos 30 dias y mas adelante", () => {
    const hoy = "2026-10-08"
    const reglas = [
      regla({ id: "luz", start_date: "2026-01-08", next_run_date: "2026-10-08" }),
      regla({ id: "alquiler", start_date: "2026-01-31", next_run_date: "2026-10-31" }),
      regla({
        id: "seguro",
        frequency: "yearly",
        start_date: "2026-03-10",
        next_run_date: "2027-03-10",
      }),
      regla({ id: "pausada", active: 0, next_run_date: "2026-10-20" }),
    ]
    const v = recurrentesQueVienen(reglas, hoy, 30)
    expect(v.hoy.map((x) => `${x.regla.id} ${x.fecha}`)).toEqual(["luz 2026-10-08"])
    // La luz vuelve el 08/11, a 31 dias: queda fuera de los 30.
    expect(v.proximos.map((x) => `${x.regla.id} ${x.fecha}`)).toEqual(["alquiler 2026-10-31"])
    expect(v.masAdelante.map((x) => `${x.regla.id} ${x.fecha}`)).toEqual(["seguro 2027-03-10"])
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
