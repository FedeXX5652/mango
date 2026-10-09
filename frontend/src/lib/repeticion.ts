// Repeticion de los recordatorios (1.5.0, ver 0030): que dias vence cada uno.
//
// El mismo motor esta en el servidor (backend/app/services/repeticion.py) y los
// dos pasan los mismos casos (repeticion.casos.json): el telefono arma el
// calendario sin conexion y el servidor avisa, y tienen que coincidir.
//
// El formato es el de Samsung Reminder: no repetir, cada N dias, cada N semanas
// en ciertos dias, cada N meses (el dia D, o el primero/.../ultimo de un dia de la
// semana), cada N anios en la misma fecha; para siempre, N veces o hasta una
// fecha. Sin feriados (decision del usuario, 2026-10-03): un vencimiento que cae
// sabado o domingo se puede pasar al lunes o adelantar al viernes.
//
// Cada ocurrencia tiene dos fechas:
// - `nominal`: la que dice la regla. Identifica al ciclo (`idCiclo`).
// - `vence`: la que se muestra y se avisa, corrida por el fin de semana.
//
// Las fechas son "AAAA-MM-DD" (como en la base) y la cuenta se hace en dias
// enteros desde 1970 en UTC: sin horas, no hay zona horaria que la corra.

import { formatearFechaCorta } from "@/lib/fecha"
import { uuidv5 } from "@/lib/uuid"

export type Frecuencia = "once" | "daily" | "weekly" | "monthly" | "yearly"
export type CorrimientoFinde = "none" | "next" | "previous"

// Los nombres son los de las columnas de `reminders`: una fila sirve de regla.
export type Regla = {
  freq: Frecuencia
  start_date: string
  interval_count?: number | null
  // Semanal: mascara de dias, lunes = 1, martes = 2, ... domingo = 64.
  weekdays?: number | null
  // Mensual: el dia D ("day") o el primero/.../ultimo de un dia de la semana.
  month_mode?: "day" | "weekday" | null
  month_day?: number | null
  month_week?: number | null // 1..4, o -1 = el ultimo
  month_weekday?: number | null // 0 = lunes .. 6 = domingo
  until_date?: string | null
  count?: number | null
  weekend_shift?: CorrimientoFinde | null
}

export type Ocurrencia = { nominal: string; vence: string }

// Fijo: cambiarlo cambia el id de todos los ciclos (el mismo que en Python).
export const ESPACIO_CICLOS = "3b8f7a52-4d1e-4c6b-9a0f-2c5e8d7b1a64"

const DIA_MS = 86_400_000
// Corrimiento maximo por fin de semana (domingo -> viernes, sabado -> lunes).
const CORRIMIENTO_MAX = 2

export function idCiclo(reminderId: string, nominal: string): string {
  return uuidv5(ESPACIO_CICLOS, `${reminderId.toLowerCase()}:${nominal}`)
}

// --- Fechas como dias enteros ----------------------------------------------------

export function aDia(fecha: string): number {
  const [a, m, d] = fecha.slice(0, 10).split("-").map(Number)
  return Date.UTC(a, m - 1, d) / DIA_MS
}

export function deDia(dia: number): string {
  return new Date(dia * DIA_MS).toISOString().slice(0, 10)
}

// 0 = lunes .. 6 = domingo, como `date.weekday()` de Python.
export function diaDeSemana(dia: number): number {
  return (new Date(dia * DIA_MS).getUTCDay() + 6) % 7
}

function diasDelMes(anio: number, mes: number): number {
  return new Date(Date.UTC(anio, mes, 0)).getUTCDate()
}

function diaDe(anio: number, mes: number, dia: number): number {
  return Date.UTC(anio, mes - 1, dia) / DIA_MS
}

// --- La regla ----------------------------------------------------------------------

export function correr(dia: number, corrimiento: CorrimientoFinde | null | undefined): number {
  const d = diaDeSemana(dia)
  if (d < 5 || !corrimiento || corrimiento === "none") return dia
  if (corrimiento === "next") return dia + (7 - d) // sabado +2, domingo +1: el lunes
  return dia - (d - 4) // sabado -1, domingo -2: el viernes
}

function diaDeSemanaDelMes(anio: number, mes: number, semana: number, dia: number): number {
  if (semana === -1) {
    const ultimo = diaDe(anio, mes, diasDelMes(anio, mes))
    return ultimo - ((diaDeSemana(ultimo) - dia + 7) % 7)
  }
  const primero = diaDe(anio, mes, 1)
  return primero + ((dia - diaDeSemana(primero) + 7) % 7) + 7 * (semana - 1)
}

// Las fechas nominales desde el inicio, en orden y sin fin (el corte lo hace
// `nominales`).
function* diarias(inicio: number, paso: number): Generator<number> {
  for (let d = inicio; ; d += paso) yield d
}

function* semanales(inicio: number, paso: number, mascara: number): Generator<number> {
  for (let lunes = inicio - diaDeSemana(inicio); ; lunes += 7 * paso) {
    for (let dia = 0; dia < 7; dia++) {
      if ((mascara & (1 << dia)) !== 0 && lunes + dia >= inicio) yield lunes + dia
    }
  }
}

function* mensuales(r: Regla, inicio: number, paso: number): Generator<number> {
  const [anio0, mes0, dia0] = r.start_date.slice(0, 10).split("-").map(Number)
  for (let indice = anio0 * 12 + mes0 - 1; ; indice += paso) {
    const anio = Math.floor(indice / 12)
    const mes = (indice % 12) + 1
    const d =
      r.month_mode === "weekday"
        ? diaDeSemanaDelMes(anio, mes, r.month_week || 1, r.month_weekday || 0)
        : diaDe(anio, mes, Math.min(r.month_day || dia0, diasDelMes(anio, mes)))
    if (d >= inicio) yield d
  }
}

function* anuales(r: Regla, paso: number): Generator<number> {
  const [anio0, mes0, dia0] = r.start_date.slice(0, 10).split("-").map(Number)
  for (let anio = anio0; ; anio += paso) {
    yield diaDe(anio, mes0, Math.min(dia0, diasDelMes(anio, mes0)))
  }
}

// Una rama por frecuencia, cada una con su generador: ninguna puede seguir de
// largo en la de abajo (como en el motor de Python).
function* candidatas(r: Regla): Generator<number> {
  const inicio = aDia(r.start_date)
  const paso = Math.max(r.interval_count ?? 1, 1)
  switch (r.freq) {
    case "once":
      yield inicio
      return
    case "daily":
      yield* diarias(inicio, paso)
      return
    case "weekly":
      yield* semanales(inicio, paso, r.weekdays || 1 << diaDeSemana(inicio))
      return
    case "monthly":
      yield* mensuales(r, inicio, paso)
      return
    case "yearly":
      yield* anuales(r, paso)
      return
    default:
      throw new Error(`freq desconocida: ${String(r.freq)}`)
  }
}

// Las fechas nominales con el corte de la regla (N veces o hasta una fecha).
export function* nominales(r: Regla): Generator<number> {
  const hasta = r.until_date ? aDia(r.until_date) : null
  let n = 0
  for (const d of candidatas(r)) {
    if (hasta !== null && d > hasta) return
    yield d
    n += 1
    if (r.count != null && n >= r.count) return
  }
}

// Las ocurrencias que vencen entre `desde` y `hasta` (inclusive), ordenadas por
// vencimiento.
export function ocurrencias(r: Regla, desde: string, hasta: string): Ocurrencia[] {
  const d0 = aDia(desde)
  const d1 = aDia(hasta)
  const salida: { nominal: number; vence: number }[] = []
  for (const d of nominales(r)) {
    if (d > d1 + CORRIMIENTO_MAX) break
    const vence = correr(d, r.weekend_shift)
    if (vence >= d0 && vence <= d1) salida.push({ nominal: d, vence })
  }
  salida.sort((a, b) => a.vence - b.vence || a.nominal - b.nominal)
  return salida.map((o) => ({ nominal: deDia(o.nominal), vence: deDia(o.vence) }))
}

// La primera ocurrencia que vence `desde` en adelante, o null si la regla ya
// termino.
export function siguiente(r: Regla, desde: string): Ocurrencia | null {
  const d0 = aDia(desde)
  for (const d of nominales(r)) {
    if (correr(d, r.weekend_shift) >= d0) {
      // Con corrimientos, una nominal cercana podria vencer antes que esta: se
      // elige la primera por vencimiento entre las que estan a tiro.
      return ocurrencias(r, desde, deDia(d + 2 * CORRIMIENTO_MAX))[0]
    }
  }
  return null
}

// --- Como se lee -------------------------------------------------------------------

const DIAS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]
const DIAS_PLURAL = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábados", "domingos"]
const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
]
export const ORDINALES: Record<number, string> = {
  1: "primer",
  2: "segundo",
  3: "tercer",
  4: "cuarto",
  [-1]: "último",
}

export function nombreDia(dia: number): string {
  return DIAS[dia]
}

function enLista(partes: string[]): string {
  return partes.length < 2
    ? (partes[0] ?? "")
    : `${partes.slice(0, -1).join(", ")} y ${partes.at(-1)}`
}

// "Todos los meses, el día 10", "Cada 2 semanas, los martes y sábados", "Todos los
// años, el 4 de octubre, 3 veces": como lo dice Samsung Reminder.
export function describir(r: Regla): string {
  const n = r.interval_count ?? 1
  const [, mes0, dia0] = r.start_date.slice(0, 10).split("-").map(Number)
  let texto: string
  switch (r.freq) {
    case "once":
      return "No se repite"
    case "daily":
      texto = n === 1 ? "Todos los días" : `Cada ${n} días`
      break
    case "weekly": {
      const mascara = r.weekdays || 1 << diaDeSemana(aDia(r.start_date))
      const dias =
        mascara === 31
          ? "de lunes a viernes"
          : `los ${enLista(DIAS_PLURAL.filter((_, i) => (mascara & (1 << i)) !== 0))}`
      texto = `${n === 1 ? "Todas las semanas" : `Cada ${n} semanas`}, ${dias}`
      break
    }
    case "monthly": {
      const dia = r.month_day ?? dia0
      const cuando =
        r.month_mode === "weekday"
          ? `el ${ORDINALES[r.month_week ?? 1]} ${DIAS[r.month_weekday ?? 0]}`
          : dia === 31
            ? "el último día"
            : `el día ${dia}`
      texto = `${n === 1 ? "Todos los meses" : `Cada ${n} meses`}, ${cuando}`
      break
    }
    case "yearly":
      texto = `${n === 1 ? "Todos los años" : `Cada ${n} años`}, el ${dia0} de ${MESES[mes0 - 1]}`
      break
  }
  if (r.count) return `${texto}, ${r.count} ${r.count === 1 ? "vez" : "veces"}`
  if (r.until_date) return `${texto}, hasta el ${formatearFechaCorta(r.until_date)}`
  return texto
}

export const TEXTO_FINDE: Record<CorrimientoFinde, string> = {
  none: "Si cae sábado o domingo, queda ese día",
  next: "Si cae sábado o domingo, pasa al lunes",
  previous: "Si cae sábado o domingo, se adelanta al viernes",
}
