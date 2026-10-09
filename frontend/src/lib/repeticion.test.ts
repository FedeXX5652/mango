import { describe, expect, it } from "vitest"

import { describir, idCiclo, ocurrencias, siguiente, type Regla } from "@/lib/repeticion"
import casos from "@/lib/repeticion.casos.json"

// Los mismos casos que corre el servidor (backend/tests/test_repeticion.py): si
// el telefono y el servidor no calculan las mismas fechas, el calendario y los
// avisos no coinciden.

describe("ocurrencias", () => {
  it.each(casos.ocurrencias)("$nombre", (caso) => {
    const obtenido = ocurrencias(caso.regla as Regla, caso.desde, caso.hasta)
    expect(obtenido.map((o) => [o.nominal, o.vence])).toEqual(caso.esperado)
  })
})

describe("siguiente", () => {
  it.each(casos.siguiente)("$nombre", (caso) => {
    const o = siguiente(caso.regla as Regla, caso.desde)
    expect(o ? [o.nominal, o.vence] : null).toEqual(caso.esperado)
  })
})

describe("id del ciclo", () => {
  it.each(casos.ids)("$nominal", (caso) => {
    expect(idCiclo(caso.reminder_id, caso.nominal)).toBe(caso.id)
  })
})

describe("como se lee", () => {
  const base = { start_date: "2026-10-10" } as const
  it("como en Samsung Reminder", () => {
    expect(describir({ ...base, freq: "once" })).toBe("No se repite")
    expect(describir({ ...base, freq: "daily" })).toBe("Todos los días")
    expect(describir({ ...base, freq: "daily", interval_count: 3 })).toBe("Cada 3 días")
    // Sin dias elegidos, el del inicio (2026-10-10 es sabado).
    expect(describir({ ...base, freq: "weekly" })).toBe("Todas las semanas, los sábados")
    expect(describir({ ...base, freq: "weekly", interval_count: 2, weekdays: 34 })).toBe(
      "Cada 2 semanas, los martes y sábados",
    )
    expect(describir({ ...base, freq: "weekly", weekdays: 1 | 4 | 16 })).toBe(
      "Todas las semanas, los lunes, miércoles y viernes",
    )
    expect(describir({ ...base, freq: "weekly", weekdays: 31 })).toBe(
      "Todas las semanas, de lunes a viernes",
    )
    expect(describir({ ...base, freq: "monthly", month_mode: "day", month_day: 10 })).toBe(
      "Todos los meses, el día 10",
    )
    expect(describir({ ...base, freq: "monthly", month_mode: "day", month_day: 31 })).toBe(
      "Todos los meses, el último día",
    )
    expect(
      describir({
        ...base,
        freq: "monthly",
        month_mode: "weekday",
        month_week: 2,
        month_weekday: 1,
      }),
    ).toBe("Todos los meses, el segundo martes")
    expect(
      describir({
        ...base,
        freq: "monthly",
        interval_count: 2,
        month_mode: "weekday",
        month_week: -1,
        month_weekday: 4,
      }),
    ).toBe("Cada 2 meses, el último viernes")
    expect(describir({ ...base, freq: "yearly" })).toBe("Todos los años, el 10/10")
  })
  it("con el fin", () => {
    expect(describir({ ...base, freq: "daily", count: 1 })).toBe("Todos los días, 1 vez")
    expect(describir({ ...base, freq: "monthly", month_day: 10, count: 6 })).toBe(
      "Todos los meses, el día 10, 6 veces",
    )
    expect(describir({ ...base, freq: "yearly", until_date: "2030-12-31" })).toBe(
      "Todos los años, el 10/10, hasta el 31/12/2030",
    )
  })
})
