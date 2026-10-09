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
import type { FechasDeRegla } from "@/lib/recurrentes"
import { usuarioActualId } from "@/lib/sesion"
import { uuidv4 } from "@/lib/uuid"

export type EstadoCiclo = "pending" | "paid" | "skipped"

export type Aviso = { days_before: number; time: string }

// Una fila de `reminders` con lo que hace falta de su plantilla.
export type RecordatorioLocal = Regla & {
  id: string
  // De un grupo (1.6.0, C3), o null si es personal.
  group_id: string | null
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
  // "Avisarme" (1.6.0): la tarjeta o la deuda que sigue, y como se llama.
  payment_method_id: string | null
  debt_id: string | null
  tarjeta: string | null
  deuda_con: string | null
}

export type CicloLocal = {
  id: string
  reminder_id: string
  nominal_date: string
  status: EstadoCiclo
  transaction_id: string | null
  // Quien lo respondio: en uno de grupo, se dice (1.6.0).
  answered_by: string | null
  // "Más tarde" (etapa 2): instante ISO hasta el que calla el aviso.
  snoozed_until: string | null
  // En uno de grupo, el de cada uno (G3): el JSON de {user_id: instante}.
  snoozes: string | null
}

export type Vencimiento = {
  recordatorio: RecordatorioLocal
  nominal: string
  vence: string
  estado: EstadoCiclo
  transactionId: string | null
  pospuesto: string | null
  respondidoPor: string | null
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

const SELECT_RECORDATORIOS = `
  SELECT r.*, t.name AS plantilla, t.amount AS monto, t.currency AS moneda,
         pm.name AS tarjeta, d.counterparty AS deuda_con
  FROM reminders r
  LEFT JOIN templates t ON t.id = r.template_id AND t.deleted_at IS NULL
  LEFT JOIN payment_methods pm ON pm.id = r.payment_method_id AND pm.deleted_at IS NULL
  LEFT JOIN debts d ON d.id = r.debt_id AND d.deleted_at IS NULL
  WHERE r.deleted_at IS NULL`

// Los personales. Los de un grupo se ven en el espacio del grupo (1.6.0, G1).
export const SQL_RECORDATORIOS = `${SELECT_RECORDATORIOS} AND r.group_id IS NULL ORDER BY r.title`

// Los de un grupo (el parametro).
export const SQL_RECORDATORIOS_GRUPO = `${SELECT_RECORDATORIOS} AND r.group_id = ? ORDER BY r.title`

// Las recurrentes que se ven en el calendario como informacion (1.6.0): solo
// las activas; las fechas salen de `recurrentesQueVienen` (lib/recurrentes.ts).
export const SQL_RECURRENTES = `
  SELECT id, name, kind, amount, currency, frequency, interval_count, start_date,
         next_run_date, end_date, active
  FROM recurring_rules WHERE deleted_at IS NULL AND active = 1`

export type RecurrenteEnCalendario = FechasDeRegla & {
  id: string
  name: string
  kind: "expense" | "income" | "transfer"
  amount: number
  currency: string
}

export const SQL_CICLOS = `
  SELECT id, reminder_id, nominal_date, status, transaction_id, answered_by, snoozed_until,
         snoozes
  FROM reminder_cycles WHERE deleted_at IS NULL`

// El "Más tarde" de este dispositivo: el del ciclo (personal) o, en uno de grupo,
// el mio del mapa (G3).
export function pospuestoDe(c: Pick<CicloLocal, "snoozed_until" | "snoozes">): string | null {
  if (c.snoozed_until) return c.snoozed_until
  return mapaDe(c.snoozes)[usuarioActualId() ?? ""] ?? null
}

function mapaDe(texto: string | null): Record<string, string> {
  if (!texto) return {}
  try {
    const mapa: unknown = JSON.parse(texto)
    return mapa && typeof mapa === "object" ? (mapa as Record<string, string>) : {}
  } catch {
    return {}
  }
}

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
      pospuesto: c ? pospuestoDe(c) : null,
      respondidoPor: c?.answered_by ?? null,
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
    pospuesto: c ? pospuestoDe(c) : null,
    respondidoPor: c?.answered_by ?? null,
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

// --- "Avisarme" en una tarjeta o una deuda (1.6.0) -------------------------------

// Con que arranca el formulario. El servidor mantiene al dia lo que se guarda:
// si cambia el dia de vencimiento o la fecha, lo corre (0030).
export type Semilla = {
  title: string
  start_date: string
  rep: Repeticion
  payment_method_id?: string
  debt_id?: string
  vinculo: string
}

// El proximo dia `dia` del mes desde `hoy` (inclusive). Saltea los meses que no
// lo tienen: la fecha arma la regla ("el dia 30"), y un 28 de febrero la
// dejaria en el 28.
export function proximoDiaDelMes(dia: number, hoy: string): string {
  const [a0, m0] = hoy.split("-").map(Number)
  for (let i = 0; i < 13; i++) {
    const total = m0 - 1 + i
    const anio = a0 + Math.floor(total / 12)
    const mes = (total % 12) + 1
    const ultimo = new Date(Date.UTC(anio, mes, 0)).getUTCDate()
    // "El ultimo dia" (31) vale el ultimo de cada mes.
    const d = dia >= 31 ? ultimo : dia
    if (d > ultimo) continue
    const fecha = `${anio}-${String(mes).padStart(2, "0")}-${String(d).padStart(2, "0")}`
    if (fecha >= hoy) return fecha
  }
  return hoy
}

export function textoVinculo(r: {
  tarjeta: string | null
  deuda_con: string | null
}): string | null {
  if (r.tarjeta)
    return `Sigue a la tarjeta ${r.tarjeta}: si cambia su día de vencimiento, se corre solo.`
  if (r.deuda_con) return `Sigue a la deuda con ${r.deuda_con}: saldarla lo marca pagado.`
  return null
}

// Una tarjeta de credito: todos los meses, el dia de vencimiento.
export function semillaDeTarjeta(
  t: { id: string; name: string; due_day: number },
  hoy: string,
): Semilla {
  return {
    title: t.name,
    start_date: proximoDiaDelMes(t.due_day, hoy),
    rep: { ...NO_SE_REPITE, freq: "monthly", mensual: t.due_day >= 31 ? "ultimo-dia" : "dia" },
    payment_method_id: t.id,
    vinculo: textoVinculo({ tarjeta: t.name, deuda_con: null }) ?? "",
  }
}

// Una deuda: una sola vez, en su fecha.
export function semillaDeDeuda(d: {
  id: string
  counterparty: string
  direction: "payable" | "receivable"
  due_date: string
}): Semilla {
  return {
    title: `${d.direction === "payable" ? "Pagarle" : "Cobrarle"} a ${d.counterparty}`,
    start_date: d.due_date,
    rep: NO_SE_REPITE,
    debt_id: d.id,
    vinculo: textoVinculo({ tarjeta: null, deuda_con: d.counterparty }) ?? "",
  }
}

// --- Escrituras locales ------------------------------------------------------------

export type DatosRecordatorio = CamposRegla & {
  title: string
  notes: string | null
  template_id: string | null
  weekend_shift: CorrimientoFinde
  alerts: Aviso[]
  followup_days: number | null
  // Solo al crearlo ("Avisarme"): despues el vinculo no cambia.
  payment_method_id?: string | null
  debt_id?: string | null
  // De un grupo (1.6.0): se elige al crearlo.
  group_id?: string | null
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
       alerts, followup_days, track_from, id, owner_id, payment_method_id, debt_id, group_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      ...valores,
      desde,
      id,
      usuarioActualId(),
      datos.payment_method_id ?? null,
      datos.debt_id ?? null,
      datos.group_id ?? null,
    ],
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
      // Responder (o deshacer) deja sin efecto el "Más tarde" (en uno de grupo,
      // el de todos: lo hace el servidor).
      if (estado !== "paid") {
        await tx.execute(
          "UPDATE reminder_cycles SET status = ?, transaction_id = NULL, snoozed_until = NULL, snoozes = NULL WHERE id = ?",
          [estado, id],
        )
      } else if (transactionId) {
        await tx.execute(
          "UPDATE reminder_cycles SET status = ?, transaction_id = ?, snoozed_until = NULL, snoozes = NULL WHERE id = ?",
          [estado, transactionId, id],
        )
      } else {
        // "Ya lo pague" sin movimiento no borra el que cargo otro.
        await tx.execute(
          "UPDATE reminder_cycles SET status = ?, snoozed_until = NULL, snoozes = NULL WHERE id = ?",
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
// `quien`: en uno de grupo, quien lo respondio ("pagado por Beto").
export function detalleVencimiento(
  v: Vencimiento,
  hoy: string,
  cuantos = 1,
  ahora: Date = new Date(),
  quien?: string,
): string {
  return `${ddmmaaaa(v.vence)} · ${estadoVencimiento(v, hoy, cuantos, ahora, quien)}`
}

function estadoVencimiento(
  v: Vencimiento,
  hoy: string,
  cuantos: number,
  ahora: Date,
  quien?: string,
): string {
  const por = quien ? ` por ${quien}` : ""
  if (v.estado === "paid") return `pagado${por}`
  if (v.estado === "skipped") return `omitido${por}`
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
//
// En uno de grupo es de cada uno (1.6.0, G3): se cambia la clave propia del mapa
// `snoozes` y el servidor toma solo esa (las demas son de otros). Asi "quitarlo"
// sube algo aunque `snoozed_until` ya estuviera vacio.
export async function posponerCiclo(
  db: AbstractPowerSyncDatabase,
  reminderId: string,
  nominal: string,
  hasta: Date | null,
  grupo = false,
): Promise<void> {
  const id = idCiclo(reminderId, nominal)
  const valor = hasta ? hasta.toISOString() : null
  await db.writeTransaction(async (tx) => {
    const fila = await tx.getOptional<{ id: string; snoozes: string | null }>(
      "SELECT id, snoozes FROM reminder_cycles WHERE id = ?",
      [id],
    )
    const columna = grupo ? "snoozes" : "snoozed_until"
    let dato = valor
    if (grupo) {
      const mapa = mapaDe(fila?.snoozes ?? null)
      const yo = usuarioActualId() ?? ""
      if (valor) mapa[yo] = valor
      else delete mapa[yo]
      dato = Object.keys(mapa).length > 0 ? JSON.stringify(mapa) : null
    }
    if (fila) {
      await tx.execute(`UPDATE reminder_cycles SET ${columna} = ? WHERE id = ?`, [dato, id])
      return
    }
    await tx.execute(
      `INSERT INTO reminder_cycles (id, owner_id, reminder_id, nominal_date, status, ${columna})
       VALUES (?, ?, ?, ?, 'pending', ?)`,
      [id, usuarioActualId(), reminderId, nominal, dato],
    )
  })
}
