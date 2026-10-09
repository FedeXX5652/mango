import type { AbstractPowerSyncDatabase } from "@powersync/web"
import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  type CicloLocal,
  NO_SE_REPITE,
  posponerCiclo,
  type RecordatorioLocal,
  type Repeticion,
  type Vencimiento,
  SQL_RECORDATORIOS,
  SQL_RECORDATORIOS_GRUPO,
  armarCalendario,
  cambioLaRegla,
  detalleVencimiento,
  etiquetaVence,
  guardarRecordatorio,
  pospuestoDe,
  proximoDiaDelMes,
  puedeCaerEnFinde,
  reglaDe,
  repeticionDe,
  responderCiclo,
  semanaDelMes,
  semillaDeDeuda,
  semillaDeTarjeta,
  textoVinculo,
} from "@/lib/recordatorios"
import { idCiclo } from "@/lib/repeticion"

vi.mock("@/lib/sesion", () => ({ usuarioActualId: () => "yo" }))

// `node:sqlite` viene con Node: se pide en tiempo de ejecucion (ver lente.test.ts).
type Sqlite = typeof import("node:sqlite")
const { DatabaseSync } = (
  globalThis as unknown as { process: { getBuiltinModule(id: string): Sqlite } }
).process.getBuiltinModule("node:sqlite")
type DatabaseSync = InstanceType<Sqlite["DatabaseSync"]>

function recordatorio(over: Partial<RecordatorioLocal> = {}): RecordatorioLocal {
  return {
    id: "r1",
    group_id: null,
    title: "Alquiler",
    notes: null,
    template_id: null,
    freq: "monthly",
    interval_count: 1,
    month_mode: "day",
    month_day: 10,
    start_date: "2026-01-10",
    weekend_shift: "next",
    track_from: "2026-09-01",
    alerts: '[{"days_before":0,"time":"09:00"}]',
    followup_days: 3,
    plantilla: null,
    monto: null,
    moneda: null,
    payment_method_id: null,
    debt_id: null,
    tarjeta: null,
    deuda_con: null,
    ...over,
  }
}

const HOY = "2026-10-04" // domingo

describe("el calendario", () => {
  it("lo vencido sin responder, lo de hoy y lo proximo", () => {
    // Sep 10 (jueves) vencio y no se marco; Oct 10 es sabado: pasa al lunes 12.
    const cal = armarCalendario([recordatorio()], [], HOY)
    expect(cal.vencidos.map((v) => [v.primero.vence, v.cuantos])).toEqual([["2026-09-10", 1]])
    expect(cal.proximos.map((v) => [v.nominal, v.vence])).toEqual([["2026-10-10", "2026-10-12"]])
    expect(cal.hoy).toEqual([])
    expect(cal.masAdelante).toEqual([])
  })

  it("lo respondido deja de estar vencido", () => {
    const ciclos: CicloLocal[] = [
      {
        id: "c",
        reminder_id: "r1",
        nominal_date: "2026-09-10",
        status: "paid",
        transaction_id: null,
        answered_by: null,
        snoozed_until: null,
        snoozes: null,
      },
    ]
    expect(armarCalendario([recordatorio()], ciclos, HOY).vencidos).toEqual([])
  })

  it("lo vencido cuenta desde track_from", () => {
    // Creado (o cambiada la regla) despues del 10 de septiembre: no debe nada.
    const cal = armarCalendario([recordatorio({ track_from: "2026-09-15" })], [], HOY)
    expect(cal.vencidos).toEqual([])
  })

  it("muchos vencidos de uno: el mas viejo y cuantos", () => {
    const diario = recordatorio({
      freq: "daily",
      month_mode: null,
      month_day: null,
      weekend_shift: "none",
      start_date: "2026-09-30",
      track_from: "2026-09-30",
    })
    const cal = armarCalendario([diario], [], HOY)
    expect(cal.vencidos.map((v) => [v.primero.vence, v.cuantos])).toEqual([["2026-09-30", 4]])
    expect(cal.hoy.map((v) => v.vence)).toEqual([HOY])
    expect(cal.proximos).toHaveLength(30)
  })

  it("lo de hoy se ve aunque ya este pagado", () => {
    const unico = recordatorio({
      id: "r2",
      freq: "once",
      month_mode: null,
      month_day: null,
      start_date: HOY,
      weekend_shift: "none",
    })
    const pagado: CicloLocal = {
      id: "c",
      reminder_id: "r2",
      nominal_date: HOY,
      status: "paid",
      transaction_id: "tx",
      answered_by: null,
      snoozed_until: null,
      snoozes: null,
    }
    const cal = armarCalendario([unico], [pagado], HOY)
    expect(cal.hoy.map((v) => [v.estado, v.transactionId])).toEqual([["paid", "tx"]])
  })

  it("lo que vence despues de los 30 dias va a 'mas adelante'", () => {
    const anual = recordatorio({
      id: "r3",
      title: "Patente",
      freq: "yearly",
      month_mode: null,
      month_day: null,
      start_date: "2026-03-15",
      weekend_shift: "none",
    })
    const cal = armarCalendario([anual], [], HOY)
    expect(cal.masAdelante.map((v) => v.vence)).toEqual(["2027-03-15"])
    expect(cal.proximos).toEqual([])
  })

  it("un recordatorio terminado no aparece", () => {
    const terminado = recordatorio({ count: 2, track_from: "2026-10-01" })
    expect(armarCalendario([terminado], [], HOY)).toEqual({
      vencidos: [],
      hoy: [],
      proximos: [],
      masAdelante: [],
    })
  })
})

describe("la repeticion, relativa a la fecha (como Samsung)", () => {
  const rep = (over: Partial<Repeticion>): Repeticion => ({ ...NO_SE_REPITE, ...over })
  // 2026-10-10 es el segundo sabado de octubre.
  const FECHA = "2026-10-10"

  it("semanal: sin dias elegidos, el de la fecha", () => {
    expect(reglaDe(FECHA, rep({ freq: "weekly" })).weekdays).toBe(32)
    expect(reglaDe(FECHA, rep({ freq: "weekly", dias: 9 })).weekdays).toBe(9)
  })

  it("mensual: el dia, el ultimo dia, el enesimo o el ultimo de la semana", () => {
    const m = (mensual: Repeticion["mensual"]) => {
      const r = reglaDe(FECHA, rep({ freq: "monthly", mensual }))
      return [r.month_mode, r.month_day, r.month_week, r.month_weekday]
    }
    expect(m("dia")).toEqual(["day", 10, null, null])
    expect(m("ultimo-dia")).toEqual(["day", 31, null, null])
    expect(m("enesimo")).toEqual(["weekday", null, 2, 5])
    expect(m("ultimo-de-la-semana")).toEqual(["weekday", null, -1, 5])
  })

  it("la quinta semana solo puede ser 'el ultimo'", () => {
    expect(semanaDelMes("2026-10-31")).toBe(0)
    expect(reglaDe("2026-10-31", rep({ freq: "monthly", mensual: "enesimo" })).month_week).toBe(-1)
  })

  it("el fin: veces o fecha, y nada si no se repite", () => {
    expect(reglaDe(FECHA, rep({ freq: "daily", fin: "veces", veces: 6 })).count).toBe(6)
    expect(
      reglaDe(FECHA, rep({ freq: "daily", fin: "fecha", hasta: "2027-01-01" })).until_date,
    ).toBe("2027-01-01")
    const unica = reglaDe(FECHA, rep({ fin: "veces", veces: 6, intervalo: 3 }))
    expect([unica.count, unica.interval_count]).toEqual([null, 1])
  })

  it("ida y vuelta: lo guardado se vuelve a leer igual", () => {
    for (const r of [
      rep({ freq: "weekly", intervalo: 2, dias: 34, fin: "veces", veces: 4 }),
      rep({ freq: "monthly", mensual: "ultimo-dia", fin: "fecha", hasta: "2027-06-30" }),
      rep({ freq: "monthly", mensual: "enesimo", intervalo: 3 }),
      rep({ freq: "yearly" }),
    ]) {
      const regla = reglaDe(FECHA, r)
      expect(reglaDe(FECHA, repeticionDe(regla))).toEqual(regla)
    }
  })

  it("solo se pregunta por el fin de semana si puede caer en uno", () => {
    const p = (r: Partial<Repeticion>) => puedeCaerEnFinde(reglaDe(FECHA, rep(r)))
    expect(p({ freq: "monthly" })).toBe(true)
    expect(p({ freq: "yearly" })).toBe(true)
    // El segundo sabado: cae siempre en sabado.
    expect(p({ freq: "monthly", mensual: "enesimo" })).toBe(true)
    expect(
      puedeCaerEnFinde(reglaDe("2026-10-13", rep({ freq: "monthly", mensual: "enesimo" }))),
    ).toBe(false)
    expect(p({ freq: "once" })).toBe(false)
    expect(p({ freq: "weekly" })).toBe(false)
    expect(p({ freq: "daily" })).toBe(false)
  })

  it("cambio la regla vs. cambio otra cosa", () => {
    const a = recordatorio()
    const otroTitulo = { ...a, title: "Otro" }
    expect(cambioLaRegla(a, otroTitulo)).toBe(false)
    expect(cambioLaRegla(a, { ...a, month_day: 15 })).toBe(true)
    expect(cambioLaRegla(a, { ...a, weekend_shift: "none" })).toBe(true)
  })
})

describe("contra el SQLite del dispositivo", () => {
  let sq: DatabaseSync
  let db: AbstractPowerSyncDatabase

  beforeEach(() => {
    sq = new DatabaseSync(":memory:")
    sq.exec(`
      CREATE TABLE reminders (id, owner_id, title, template_id, deleted_at,
                              payment_method_id, debt_id, group_id);
      CREATE TABLE templates (id, name, amount, currency, deleted_at);
      CREATE TABLE payment_methods (id, name, deleted_at);
      CREATE TABLE debts (id, counterparty, deleted_at);
      CREATE TABLE reminder_cycles (id, owner_id, reminder_id, nominal_date, status,
                                    transaction_id, snoozed_until, deleted_at, snoozes);
    `)
    const api = {
      execute: async (sql: string, params: unknown[] = []) => {
        sq.prepare(sql).run(...(params as never[]))
        return {}
      },
      getOptional: async (sql: string, params: unknown[] = []) =>
        sq.prepare(sql).get(...(params as never[])) ?? null,
      writeTransaction: async (fn: (tx: unknown) => Promise<void>) => fn(api),
    }
    db = api as unknown as AbstractPowerSyncDatabase
  })

  const ciclo = () =>
    sq.prepare("SELECT owner_id, status, transaction_id FROM reminder_cycles").all()

  it("marcar crea la fila con el id determinista; volver a marcar la actualiza", async () => {
    await responderCiclo(db, "r1", "2026-10-10", "paid", "tx1")
    const id = sq.prepare("SELECT id FROM reminder_cycles").get() as { id: string }
    expect(id.id).toBe(idCiclo("r1", "2026-10-10"))
    expect(ciclo()).toEqual([{ owner_id: "yo", status: "paid", transaction_id: "tx1" }])
    // "Ya lo pague" sin movimiento: no borra el pago cargado.
    await responderCiclo(db, "r1", "2026-10-10", "paid")
    expect(ciclo()).toEqual([{ owner_id: "yo", status: "paid", transaction_id: "tx1" }])
    // Omitir o deshacer suelta el pago.
    await responderCiclo(db, "r1", "2026-10-10", "pending")
    expect(ciclo()).toEqual([{ owner_id: "yo", status: "pending", transaction_id: null }])
  })

  it("más tarde: crea o actualiza, y responder lo deja sin efecto", async () => {
    const hasta = new Date(Date.UTC(2026, 9, 12, 18))
    await posponerCiclo(db, "r1", "2026-10-10", hasta)
    const pospuesto = () => sq.prepare("SELECT status, snoozed_until FROM reminder_cycles").all()
    expect(pospuesto()).toEqual([{ status: "pending", snoozed_until: hasta.toISOString() }])
    await posponerCiclo(db, "r1", "2026-10-10", null)
    expect(pospuesto()).toEqual([{ status: "pending", snoozed_until: null }])
    await posponerCiclo(db, "r1", "2026-10-10", hasta)
    await responderCiclo(db, "r1", "2026-10-10", "paid")
    expect(pospuesto()).toEqual([{ status: "paid", snoozed_until: null }])
  })

  it("el monto sale de la plantilla viva", () => {
    sq.exec(`
      INSERT INTO templates VALUES ('t1', 'Alq', 50000000, 'ARS', NULL);
      INSERT INTO templates VALUES ('t2', 'Vieja', 1, 'ARS', '2026-01-01');
      INSERT INTO reminders VALUES ('r1', 'yo', 'Alquiler', 't1', NULL, NULL, NULL, NULL);
      INSERT INTO reminders VALUES ('r2', 'yo', 'Expensas', 't2', NULL, NULL, NULL, NULL);
      INSERT INTO reminders VALUES ('r3', 'yo', 'Borrado', NULL, '2026-01-01', NULL, NULL, NULL);
    `)
    const filas = sq.prepare(SQL_RECORDATORIOS).all() as {
      title: string
      plantilla: string | null
      monto: number | null
    }[]
    expect(filas.map((f) => [f.title, f.plantilla, f.monto])).toEqual([
      ["Alquiler", "Alq", 50000000],
      ["Expensas", null, null],
    ])
  })

  it("la tarjeta o la deuda que sigue, si sigue viva", () => {
    sq.exec(`
      INSERT INTO payment_methods VALUES ('pm1', 'Visa', NULL);
      INSERT INTO debts VALUES ('d1', 'Beto', NULL);
      INSERT INTO debts VALUES ('d2', 'Borrada', '2026-01-01');
      INSERT INTO reminders VALUES ('r1', 'yo', 'A', NULL, NULL, 'pm1', NULL, NULL);
      INSERT INTO reminders VALUES ('r2', 'yo', 'B', NULL, NULL, NULL, 'd1', NULL);
      INSERT INTO reminders VALUES ('r3', 'yo', 'C', NULL, NULL, NULL, 'd2', NULL);
    `)
    const filas = sq.prepare(SQL_RECORDATORIOS).all() as {
      title: string
      tarjeta: string | null
      deuda_con: string | null
    }[]
    expect(filas.map((f) => [f.title, f.tarjeta, f.deuda_con])).toEqual([
      ["A", "Visa", null],
      ["B", null, "Beto"],
      ["C", null, null],
    ])
  })

  it("Avisarme guarda el vinculo al crearlo", async () => {
    sq.exec(`
      DROP TABLE reminders;
      CREATE TABLE reminders (title, notes, template_id, freq, interval_count, weekdays,
        month_mode, month_day, month_week, month_weekday, start_date, until_date, count,
        weekend_shift, alerts, followup_days, track_from, id, owner_id, payment_method_id,
        debt_id, group_id);
    `)
    const s = semillaDeDeuda({
      id: "d1",
      counterparty: "Beto",
      direction: "payable",
      due_date: "2026-11-20",
    })
    await guardarRecordatorio(
      db,
      {
        ...reglaDe(s.start_date, s.rep),
        title: s.title,
        notes: null,
        template_id: null,
        weekend_shift: "none",
        alerts: [],
        followup_days: 3,
        debt_id: s.debt_id,
      },
      HOY,
    )
    expect(sq.prepare("SELECT title, freq, start_date, debt_id FROM reminders").all()).toEqual([
      { title: "Pagarle a Beto", freq: "once", start_date: "2026-11-20", debt_id: "d1" },
    ])
  })

  it("los personales y los de un grupo, cada uno en su espacio", () => {
    sq.exec(`
      INSERT INTO reminders VALUES ('r1', 'yo', 'Mío', NULL, NULL, NULL, NULL, NULL);
      INSERT INTO reminders VALUES ('r2', 'yo', 'Expensas', NULL, NULL, NULL, NULL, 'casa');
      INSERT INTO reminders VALUES ('r3', 'beto', 'Luz', NULL, NULL, NULL, NULL, 'casa');
      INSERT INTO reminders VALUES ('r4', 'ana', 'Club', NULL, NULL, NULL, NULL, 'otro');
    `)
    const titulos = (sql: string, params: string[] = []) =>
      (sq.prepare(sql).all(...params) as { title: string }[]).map((f) => f.title)
    expect(titulos(SQL_RECORDATORIOS)).toEqual(["Mío"])
    expect(titulos(SQL_RECORDATORIOS_GRUPO, ["casa"])).toEqual(["Expensas", "Luz"])
  })

  it("más tarde en uno de grupo: solo mi clave del mapa", async () => {
    const hasta = new Date(Date.UTC(2026, 9, 12, 18))
    const id = idCiclo("r9", "2026-10-12")
    // Ya tiene el de Beto (vino por la sync).
    sq.prepare(
      "INSERT INTO reminder_cycles (id, reminder_id, nominal_date, status, snoozes) VALUES (?, 'r9', '2026-10-12', 'pending', ?)",
    ).run(id, JSON.stringify({ beto: "2026-10-12T20:00:00.000Z" }))
    await posponerCiclo(db, "r9", "2026-10-12", hasta, true)
    const fila = () =>
      sq.prepare("SELECT snoozed_until, snoozes FROM reminder_cycles WHERE id = ?").get(id) as {
        snoozed_until: string | null
        snoozes: string | null
      }
    expect(fila().snoozed_until).toBeNull()
    expect(JSON.parse(fila().snoozes ?? "{}")).toEqual({
      beto: "2026-10-12T20:00:00.000Z",
      yo: hasta.toISOString(),
    })
    // Lo saco: el de Beto queda.
    await posponerCiclo(db, "r9", "2026-10-12", null, true)
    expect(JSON.parse(fila().snoozes ?? "{}")).toEqual({ beto: "2026-10-12T20:00:00.000Z" })
    // Responder lo deja sin efecto para todos.
    await responderCiclo(db, "r9", "2026-10-12", "paid")
    expect(fila().snoozes).toBeNull()
  })
})

describe("Avisarme en una tarjeta o una deuda", () => {
  it("el proximo dia de vencimiento, sin recortar la regla", () => {
    expect(proximoDiaDelMes(12, "2026-10-09")).toBe("2026-10-12")
    expect(proximoDiaDelMes(9, "2026-10-09")).toBe("2026-10-09")
    expect(proximoDiaDelMes(5, "2026-10-09")).toBe("2026-11-05")
    expect(proximoDiaDelMes(5, "2026-12-20")).toBe("2027-01-05")
    // Febrero no tiene 30: el primero es en marzo (un 28 dejaria la regla en 28).
    expect(proximoDiaDelMes(30, "2027-02-10")).toBe("2027-03-30")
    // El 31 es "el ultimo dia": cualquier mes lo tiene.
    expect(proximoDiaDelMes(31, "2026-11-10")).toBe("2026-11-30")
    expect(proximoDiaDelMes(31, "2027-02-10")).toBe("2027-02-28")
  })

  it("una tarjeta: todos los meses, el dia de vencimiento", () => {
    const s = semillaDeTarjeta({ id: "pm1", name: "Visa", due_day: 5 }, "2026-10-09")
    expect(s.title).toBe("Visa")
    expect(s.payment_method_id).toBe("pm1")
    const regla = reglaDe(s.start_date, s.rep)
    expect([regla.freq, regla.month_mode, regla.month_day, regla.start_date]).toEqual([
      "monthly",
      "day",
      5,
      "2026-11-05",
    ])
    // El 31 queda como "el ultimo dia", aunque arranque el 30 de noviembre.
    const ultimo = semillaDeTarjeta({ id: "pm1", name: "Visa", due_day: 31 }, "2026-11-10")
    expect(reglaDe(ultimo.start_date, ultimo.rep).month_day).toBe(31)
  })

  it("una deuda: una vez, en su fecha, y dice a quien", () => {
    const debo = semillaDeDeuda({
      id: "d1",
      counterparty: "Beto",
      direction: "payable",
      due_date: "2026-11-20",
    })
    expect([debo.title, debo.start_date, debo.rep.freq, debo.debt_id]).toEqual([
      "Pagarle a Beto",
      "2026-11-20",
      "once",
      "d1",
    ])
    const meDeben = semillaDeDeuda({
      id: "d2",
      counterparty: "Ana",
      direction: "receivable",
      due_date: "2026-11-20",
    })
    expect(meDeben.title).toBe("Cobrarle a Ana")
  })

  it("dice a que sigue", () => {
    expect(textoVinculo({ tarjeta: "Visa", deuda_con: null })).toBe(
      "Sigue a la tarjeta Visa: si cambia su día de vencimiento, se corre solo.",
    )
    expect(textoVinculo({ tarjeta: null, deuda_con: "Beto" })).toBe(
      "Sigue a la deuda con Beto: saldarla lo marca pagado.",
    )
    expect(textoVinculo({ tarjeta: null, deuda_con: null })).toBeNull()
  })
})

describe("como se lee un vencimiento", () => {
  it("hoy, mañana o la fecha como dd/mm/aaaa", () => {
    expect(etiquetaVence(HOY, HOY)).toBe("Hoy")
    expect(etiquetaVence("2026-10-05", HOY)).toBe("Mañana")
    expect(etiquetaVence("2026-10-03", HOY)).toBe("03/10/2026")
    expect(etiquetaVence("2026-10-08", HOY)).toBe("08/10/2026")
    expect(etiquetaVence("2027-01-05", HOY)).toBe("05/01/2027")
  })
})

describe("el más tarde de cada uno (grupo)", () => {
  it("el del ciclo si es personal; si no, mi clave del mapa", () => {
    expect(pospuestoDe({ snoozed_until: "2026-10-12T18:00:00Z", snoozes: null })).toBe(
      "2026-10-12T18:00:00Z",
    )
    const mapa = JSON.stringify({ yo: "2026-10-12T15:00:00Z", beto: "2026-10-12T20:00:00Z" })
    expect(pospuestoDe({ snoozed_until: null, snoozes: mapa })).toBe("2026-10-12T15:00:00Z")
    expect(pospuestoDe({ snoozed_until: null, snoozes: JSON.stringify({ beto: "x" }) })).toBeNull()
    expect(pospuestoDe({ snoozed_until: null, snoozes: "no es json" })).toBeNull()
  })
})

describe("la linea de un vencimiento", () => {
  const v = (vence: string, estado: Vencimiento["estado"] = "pending"): Vencimiento => ({
    recordatorio: recordatorio(),
    nominal: vence,
    vence,
    estado,
    transactionId: null,
    pospuesto: null,
    respondidoPor: null,
  })
  it("la fecha (dd/mm/aaaa) y cuanto falta, o el estado", () => {
    expect(detalleVencimiento(v("2026-10-12"), HOY)).toBe("12/10/2026 · lunes, en 8 días")
    expect(detalleVencimiento(v("2026-10-08"), HOY)).toBe("08/10/2026 · jueves, en 4 días")
    expect(detalleVencimiento(v("2026-10-05"), HOY)).toBe("05/10/2026 · vence mañana")
    expect(detalleVencimiento(v(HOY), HOY)).toBe("04/10/2026 · vence hoy")
    expect(detalleVencimiento(v("2026-10-03"), HOY)).toBe("03/10/2026 · venció ayer")
    expect(detalleVencimiento(v("2026-09-10"), HOY, 3)).toBe(
      "10/09/2026 · venció hace 24 días · y 2 más sin marcar",
    )
    expect(detalleVencimiento(v("2026-10-12", "paid"), HOY)).toBe("12/10/2026 · pagado")
    expect(detalleVencimiento(v("2026-10-12", "skipped"), HOY)).toBe("12/10/2026 · omitido")
  })
  it("lo pospuesto dice hasta cuando", () => {
    const ahora = new Date(2026, 9, 12, 10)
    const pospuesto = { ...v("2026-10-12"), pospuesto: new Date(2026, 9, 12, 15).toISOString() }
    expect(detalleVencimiento(pospuesto, "2026-10-12", 1, ahora)).toBe(
      "12/10/2026 · pospuesto hasta hoy a las 15:00",
    )
    // Ya paso: vuelve a decir cuando vence.
    const tarde = new Date(2026, 9, 12, 16)
    expect(detalleVencimiento(pospuesto, "2026-10-12", 1, tarde)).toBe("12/10/2026 · vence hoy")
  })
})
