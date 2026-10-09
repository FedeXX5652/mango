// Calendario de pagos (1.5.0, ver 0030): el armado del calendario y las
// escrituras locales. Las fechas salen de la regla (lib/repeticion.ts); un ciclo
// tiene fila solo cuando se responde.

import type { AbstractPowerSyncDatabase } from "@powersync/web"

import {
  type CorrimientoFinde,
  type Frecuencia,
  type Regla,
  aDia,
  correr,
  deDia,
  diaDeSemana,
  idCiclo,
  nombreDia,
  ocurrencias,
  siguiente,
} from "@/lib/repeticion"
import { textoHasta } from "@/lib/posponer"
import { usuarioActualId } from "@/lib/sesion"
import { uuidv4 } from "@/lib/uuid"

export type EstadoCiclo = "pending" | "paid" | "skipped"

export type Aviso = { days_before: number; time: string }

// Una fila de `reminders` con lo que hace falta de su plantilla.
export type RecordatorioLocal = Regla & {
  id: string
  title: string
  notes: string | null
  template_id: string | null
  track_from: string
  alerts: string | null
  followup_days: number | null
  // De la plantilla viva (LEFT JOIN): para mostrar el monto.
  plantilla: string | null
  monto: number | null
  moneda: string | null
}

export type CicloLocal = {
  id: string
  reminder_id: string
  nominal_date: string
  status: EstadoCiclo
  transaction_id: string | null
  // "Más tarde" (etapa 2): instante ISO hasta el que calla el aviso.
  snoozed_until: string | null
}

export type Vencimiento = {
  recordatorio: RecordatorioLocal
  nominal: string
  vence: string
  estado: EstadoCiclo
  transactionId: string | null
  pospuesto: string | null
}

export type Calendario = {
  // Uno por recordatorio: el vencimiento sin responder mas viejo y cuantos hay.
  vencidos: { primero: Vencimiento; cuantos: number }[]
  hoy: Vencimiento[]
  // De mañana a `dias` dias.
  proximos: Vencimiento[]
  // El siguiente de cada recordatorio que no tiene nada en los proximos.
  masAdelante: Vencimiento[]
}

export const SQL_RECORDATORIOS = `
  SELECT r.*, t.name AS plantilla, t.amount AS monto, t.currency AS moneda
  FROM reminders r
  LEFT JOIN templates t ON t.id = r.template_id AND t.deleted_at IS NULL
  WHERE r.deleted_at IS NULL
  ORDER BY r.title`

export const SQL_CICLOS = `
  SELECT id, reminder_id, nominal_date, status, transaction_id, snoozed_until
  FROM reminder_cycles WHERE deleted_at IS NULL`

export function avisosDe(r: Pick<RecordatorioLocal, "alerts">): Aviso[] {
  try {
    const lista: unknown = JSON.parse(r.alerts ?? "[]")
    return Array.isArray(lista) ? (lista as Aviso[]) : []
  } catch {
    return []
  }
}

function porVencimiento(a: Vencimiento, b: Vencimiento): number {
  return a.vence.localeCompare(b.vence) || a.recordatorio.title.localeCompare(b.recordatorio.title)
}

export function armarCalendario(
  recordatorios: RecordatorioLocal[],
  ciclos: CicloLocal[],
  hoy: string,
  dias = 30,
): Calendario {
  const ciclo = new Map(ciclos.map((c) => [`${c.reminder_id}:${c.nominal_date}`, c]))
  const vencimiento = (r: RecordatorioLocal, nominal: string, vence: string): Vencimiento => {
    const c = ciclo.get(`${r.id}:${nominal}`)
    return {
      recordatorio: r,
      nominal,
      vence,
      estado: c?.status ?? "pending",
      transactionId: c?.transaction_id ?? null,
      pospuesto: c?.snoozed_until ?? null,
    }
  }
  const hasta = deDia(aDia(hoy) + dias)
  const cal: Calendario = { vencidos: [], hoy: [], proximos: [], masAdelante: [] }

  for (const r of recordatorios) {
    // Lo vencido cuenta desde `track_from`: antes de crearlo (o de cambiar la
    // regla) no habia nada que pagar.
    const desde = r.track_from < hoy ? r.track_from : hoy
    const lista = ocurrencias(r, desde, hasta).map((o) => vencimiento(r, o.nominal, o.vence))
    const sinResponder = lista.filter((v) => v.vence < hoy && v.estado === "pending")
    if (sinResponder.length > 0) {
      cal.vencidos.push({ primero: sinResponder[0], cuantos: sinResponder.length })
    }
    const adelante = lista.filter((v) => v.vence >= hoy)
    for (const v of adelante) (v.vence === hoy ? cal.hoy : cal.proximos).push(v)
    if (adelante.length === 0) {
      const o = siguiente(r, deDia(aDia(hasta) + 1))
      if (o) cal.masAdelante.push(vencimiento(r, o.nominal, o.vence))
    }
  }
  cal.vencidos.sort((a, b) => porVencimiento(a.primero, b.primero))
  cal.hoy.sort(porVencimiento)
  cal.proximos.sort(porVencimiento)
  cal.masAdelante.sort(porVencimiento)
  return cal
}

// Un vencimiento puntual (el que abre un aviso: `/calendario?r=<id>&n=<fecha>`),
// con lo que se respondio de el.
export function vencimientoDe(
  r: RecordatorioLocal,
  ciclos: CicloLocal[],
  nominal: string,
): Vencimiento {
  const c = ciclos.find((x) => x.reminder_id === r.id && x.nominal_date === nominal)
  return {
    recordatorio: r,
    nominal,
    vence: deDia(correr(aDia(nominal), r.weekend_shift)),
    estado: c?.status ?? "pending",
    transactionId: c?.transaction_id ?? null,
    pospuesto: c?.snoozed_until ?? null,
  }
}

// --- La repeticion como la elige la persona (estilo Samsung) ---------------------

// Relativa a la fecha: "todos los meses el dia de la fecha", "el segundo martes"
// (el de la fecha)... Como en Samsung, cambiar la fecha cambia la repeticion.
export type ModoMensual = "dia" | "enesimo" | "ultimo-de-la-semana" | "ultimo-dia"
export type FinRepeticion = "nunca" | "veces" | "fecha"

export type Repeticion = {
  freq: Frecuencia
  intervalo: number
  // Semanal: dias elegidos (mascara). 0 = el de la fecha.
  dias: number
  mensual: ModoMensual
  fin: FinRepeticion
  veces: number
  hasta: string
}

export const NO_SE_REPITE: Repeticion = {
  freq: "once",
  intervalo: 1,
  dias: 0,
  mensual: "dia",
  fin: "nunca",
  veces: 10,
  hasta: "",
}

export function diaDelMes(fecha: string): number {
  return Number(fecha.slice(8, 10))
}

function diasDelMesDe(fecha: string): number {
  const [a, m] = fecha.split("-").map(Number)
  return new Date(Date.UTC(a, m, 0)).getUTCDate()
}

// Que semana del mes es la fecha (1..4), o 0 si es la quinta (solo "el ultimo").
export function semanaDelMes(fecha: string): number {
  const n = Math.floor((diaDelMes(fecha) - 1) / 7) + 1
  return n <= 4 ? n : 0
}

export function esUltimaSemana(fecha: string): boolean {
  return diaDelMes(fecha) + 7 > diasDelMesDe(fecha)
}

export type CamposRegla = Pick<
  Regla,
  | "freq"
  | "interval_count"
  | "weekdays"
  | "month_mode"
  | "month_day"
  | "month_week"
  | "month_weekday"
  | "start_date"
  | "until_date"
  | "count"
>

// De lo que eligio la persona a las columnas de la regla.
export function reglaDe(fecha: string, rep: Repeticion): CamposRegla {
  const dia = diaDeSemana(aDia(fecha))
  const regla: CamposRegla = {
    freq: rep.freq,
    interval_count: rep.freq === "once" ? 1 : Math.max(1, rep.intervalo),
    weekdays: null,
    month_mode: null,
    month_day: null,
    month_week: null,
    month_weekday: null,
    start_date: fecha,
    until_date: null,
    count: null,
  }
  if (rep.freq === "weekly") regla.weekdays = rep.dias || 1 << dia
  if (rep.freq === "monthly") {
    if (rep.mensual === "dia" || rep.mensual === "ultimo-dia") {
      regla.month_mode = "day"
      regla.month_day = rep.mensual === "ultimo-dia" ? 31 : diaDelMes(fecha)
    } else {
      regla.month_mode = "weekday"
      regla.month_weekday = dia
      regla.month_week =
        rep.mensual === "ultimo-de-la-semana" || semanaDelMes(fecha) === 0
          ? -1
          : semanaDelMes(fecha)
    }
  }
  if (rep.freq !== "once") {
    if (rep.fin === "veces") regla.count = Math.max(1, rep.veces)
    if (rep.fin === "fecha" && rep.hasta) regla.until_date = rep.hasta
  }
  return regla
}

// Al revisar uno guardado: lo que se eligio, a partir de la regla.
export function repeticionDe(r: CamposRegla): Repeticion {
  return {
    freq: r.freq,
    intervalo: r.interval_count ?? 1,
    dias: r.weekdays ?? 0,
    mensual:
      r.month_mode === "weekday"
        ? r.month_week === -1
          ? "ultimo-de-la-semana"
          : "enesimo"
        : r.month_day === 31
          ? "ultimo-dia"
          : "dia",
    fin: r.count ? "veces" : r.until_date ? "fecha" : "nunca",
    veces: r.count ?? 10,
    hasta: r.until_date ?? "",
  }
}

// Si un vencimiento puede caer en fin de semana: solo ahi se pregunta que hacer
// (C4). Una fecha unica la elige la persona, y los semanales eligen sus dias.
export function puedeCaerEnFinde(regla: CamposRegla): boolean {
  if (regla.freq === "yearly") return true
  if (regla.freq !== "monthly") return false
  return regla.month_mode === "day" || (regla.month_weekday ?? 0) >= 5
}

const CAMPOS_REGLA: (keyof Regla)[] = [
  "freq",
  "interval_count",
  "weekdays",
  "month_mode",
  "month_day",
  "month_week",
  "month_weekday",
  "start_date",
  "until_date",
  "count",
  "weekend_shift",
]

export function cambioLaRegla(a: Regla, b: Regla): boolean {
  return CAMPOS_REGLA.some((k) => (a[k] ?? null) !== (b[k] ?? null))
}

// --- Escrituras locales ------------------------------------------------------------

export type DatosRecordatorio = CamposRegla & {
  title: string
  notes: string | null
  template_id: string | null
  weekend_shift: CorrimientoFinde
  alerts: Aviso[]
  followup_days: number | null
}

export async function guardarRecordatorio(
  db: AbstractPowerSyncDatabase,
  datos: DatosRecordatorio,
  hoy: string,
  existente?: RecordatorioLocal,
): Promise<string> {
  const valores = [
    datos.title,
    datos.notes,
    datos.template_id,
    datos.freq,
    datos.interval_count ?? 1,
    datos.weekdays ?? null,
    datos.month_mode ?? null,
    datos.month_day ?? null,
    datos.month_week ?? null,
    datos.month_weekday ?? null,
    datos.start_date,
    datos.until_date ?? null,
    datos.count ?? null,
    datos.weekend_shift,
    JSON.stringify(datos.alerts),
    datos.followup_days,
  ]
  if (existente) {
    // Cambiar la regla empieza a contar los vencimientos sin marcar desde hoy:
    // si no, las fechas viejas de la regla nueva aparecerian vencidas.
    const desde = cambioLaRegla(existente, datos) ? hoy : existente.track_from
    await db.execute(
      `UPDATE reminders SET title = ?, notes = ?, template_id = ?, freq = ?, interval_count = ?,
         weekdays = ?, month_mode = ?, month_day = ?, month_week = ?, month_weekday = ?,
         start_date = ?, until_date = ?, count = ?, weekend_shift = ?, alerts = ?,
         followup_days = ?, track_from = ?
       WHERE id = ?`,
      [...valores, desde, existente.id],
    )
    return existente.id
  }
  const id = uuidv4()
  // Una fecha de inicio en el pasado es a proposito ("vencio el 5 y no pague"):
  // cuenta desde ahi.
  const desde = datos.start_date < hoy ? datos.start_date : hoy
  await db.execute(
    `INSERT INTO reminders (title, notes, template_id, freq, interval_count, weekdays, month_mode,
       month_day, month_week, month_weekday, start_date, until_date, count, weekend_shift,
       alerts, followup_days, track_from, id, owner_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [...valores, desde, id, usuarioActualId()],
  )
  return id
}

export async function borrarRecordatorio(db: AbstractPowerSyncDatabase, id: string): Promise<void> {
  await db.execute("DELETE FROM reminders WHERE id = ?", [id])
}

// Pagado, omitido o de vuelta a pendiente. El id es determinista: si la fila ya
// esta (la marco otro dispositivo), se actualiza; si no, se crea.
export async function responderCiclo(
  db: AbstractPowerSyncDatabase,
  reminderId: string,
  nominal: string,
  estado: EstadoCiclo,
  transactionId: string | null = null,
): Promise<void> {
  const id = idCiclo(reminderId, nominal)
  await db.writeTransaction(async (tx) => {
    const fila = await tx.getOptional<{ id: string }>(
      "SELECT id FROM reminder_cycles WHERE id = ?",
      [id],
    )
    if (fila) {
      // Responder (o deshacer) deja sin efecto el "Más tarde".
      if (estado !== "paid") {
        await tx.execute(
          "UPDATE reminder_cycles SET status = ?, transaction_id = NULL, snoozed_until = NULL WHERE id = ?",
          [estado, id],
        )
      } else if (transactionId) {
        await tx.execute(
          "UPDATE reminder_cycles SET status = ?, transaction_id = ?, snoozed_until = NULL WHERE id = ?",
          [estado, transactionId, id],
        )
      } else {
        // "Ya lo pague" sin movimiento no borra el que cargo otro.
        await tx.execute(
          "UPDATE reminder_cycles SET status = ?, snoozed_until = NULL WHERE id = ?",
          [estado, id],
        )
      }
      return
    }
    await tx.execute(
      `INSERT INTO reminder_cycles (id, owner_id, reminder_id, nominal_date, status, transaction_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        id,
        usuarioActualId(),
        reminderId,
        nominal,
        estado,
        estado === "paid" ? transactionId : null,
      ],
    )
  })
}

// --- Como se lee un vencimiento --------------------------------------------------

// Las fechas van siempre como dd/mm/aaaa (2026-10-08).
function ddmmaaaa(fecha: string): string {
  return `${fecha.slice(8, 10)}/${fecha.slice(5, 7)}/${fecha.slice(0, 4)}`
}

// "Hoy", "Mañana" o la fecha.
export function etiquetaVence(vence: string, hoy: string): string {
  const d = aDia(vence) - aDia(hoy)
  if (d === 0) return "Hoy"
  if (d === 1) return "Mañana"
  return ddmmaaaa(vence)
}

// La linea de abajo de un vencimiento en una lista: la fecha (dd/mm/aaaa) y que
// pasa con el ("vence hoy", "lunes, en 8 días", "pagado"...).
export function detalleVencimiento(
  v: Vencimiento,
  hoy: string,
  cuantos = 1,
  ahora: Date = new Date(),
): string {
  return `${ddmmaaaa(v.vence)} · ${estadoVencimiento(v, hoy, cuantos, ahora)}`
}

function estadoVencimiento(v: Vencimiento, hoy: string, cuantos: number, ahora: Date): string {
  if (v.estado === "paid") return "pagado"
  if (v.estado === "skipped") return "omitido"
  if (v.pospuesto && new Date(v.pospuesto) > ahora) {
    return `pospuesto hasta ${textoHasta(new Date(v.pospuesto), ahora)}`
  }
  const d = aDia(v.vence) - aDia(hoy)
  if (d < 0) {
    const hace = d === -1 ? "ayer" : `hace ${-d} días`
    return `venció ${hace}${cuantos > 1 ? ` · y ${cuantos - 1} más sin marcar` : ""}`
  }
  if (d === 0) return "vence hoy"
  if (d === 1) return "vence mañana"
  return `${nombreDia(diaDeSemana(aDia(v.vence)))}, en ${d} días`
}

// "Más tarde" (etapa 2): calla el aviso de este vencimiento hasta `hasta`
// (null = quitarlo). Solo para uno pendiente.
export async function posponerCiclo(
  db: AbstractPowerSyncDatabase,
  reminderId: string,
  nominal: string,
  hasta: Date | null,
): Promise<void> {
  const id = idCiclo(reminderId, nominal)
  const valor = hasta ? hasta.toISOString() : null
  await db.writeTransaction(async (tx) => {
    const fila = await tx.getOptional<{ id: string }>(
      "SELECT id FROM reminder_cycles WHERE id = ?",
      [id],
    )
    if (fila) {
      await tx.execute("UPDATE reminder_cycles SET snoozed_until = ? WHERE id = ?", [valor, id])
      return
    }
    await tx.execute(
      `INSERT INTO reminder_cycles (id, owner_id, reminder_id, nominal_date, status, snoozed_until)
       VALUES (?, ?, ?, ?, 'pending', ?)`,
      [id, usuarioActualId(), reminderId, nominal, valor],
    )
  })
}
