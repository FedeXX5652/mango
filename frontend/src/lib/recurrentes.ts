import { sha256 } from "@/lib/sha256"

// Generacion de recurrentes **en el dispositivo** (ver ESPECIFICACION 3.7).
//
// Antes lo hacia el servidor: la app le pedia "fijate que vencio" al abrir, y
// sin conexion tu alquiler simplemente no existia hasta reconectarte. Eso
// rompia lo principal de la arquitectura justo en lo que tiene que pasar solo.
// Ahora la cuenta se hace sobre el SQLite local y sube por la sync como
// cualquier otra escritura.
//
// El riesgo de generar en el cliente es **duplicar**: dos dispositivos sin
// conexion a fin de mes generan los dos el alquiler de septiembre. Por eso el
// id de cada movimiento generado es **determinista** —sale de (regla, fecha)—,
// asi los dos producen exactamente la misma fila y al sincronizar se colapsan
// en una en vez de sumar dos gastos.
//
// Todo lo de este archivo es puro: recibe filas y devuelve que habria que
// escribir. Lo que toca la base vive en `generar.ts`.

export type Frecuencia = "daily" | "weekly" | "monthly" | "yearly"

export interface ReglaRecurrente {
  id: string
  kind: "expense" | "income" | "transfer"
  account_id: string
  transfer_account_id: string | null
  category_id: string | null
  payment_method_id: string | null
  amount: number
  currency: string
  payee: string | null
  notes: string | null
  frequency: Frecuencia
  interval_count: number
  // Fecha de la proxima ocurrencia, "YYYY-MM-DD".
  next_run_date: string
  end_date: string | null
  active: number
}

export interface Ocurrencia {
  id: string
  regla: ReglaRecurrente
  // Dia que le toca, "YYYY-MM-DD".
  fecha: string
  // Instante que se guarda en el movimiento.
  occurred_at: string
}

export interface Pendientes {
  ocurrencias: Ocurrencia[]
  // Donde queda `next_run_date` despues de generarlas.
  proxima: string
}

// --- Fechas ------------------------------------------------------------------
//
// La aritmetica se hace sobre los numeros de la fecha, sin objetos Date, porque
// Date trabaja en la zona local y sumar un mes cruzando un cambio de horario
// puede mover el dia. Espeja `_add_period` del servidor, que es de donde salen
// las reglas de borde.

function partes(fecha: string): [number, number, number] {
  const [y, m, d] = fecha.split("-").map(Number)
  return [y, m, d]
}

function armar(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`
}

function diasDelMes(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

export function siguienteFecha(fecha: string, frecuencia: Frecuencia, n: number): string {
  const [y, m, d] = partes(fecha)

  if (frecuencia === "daily" || frecuencia === "weekly") {
    const dias = frecuencia === "weekly" ? n * 7 : n
    const t = new Date(Date.UTC(y, m - 1, d + dias))
    return armar(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate())
  }

  if (frecuencia === "monthly") {
    const total = m - 1 + n
    const anio = y + Math.floor(total / 12)
    const mes = ((total % 12) + 12) % 12
    // El 31 de enero + 1 mes es el 28 (o 29) de febrero: se recorta al ultimo
    // dia del mes destino. No se "arrastra" al 3 de marzo.
    return armar(anio, mes + 1, Math.min(d, diasDelMes(anio, mes + 1)))
  }

  // yearly: el 29 de febrero de un bisiesto cae al 28 en los que no lo son.
  const anio = y + n
  return armar(anio, m, Math.min(d, diasDelMes(anio, m)))
}

// --- Id determinista ---------------------------------------------------------

// Mismo (regla, fecha) -> mismo id, en cualquier dispositivo y sin hablar con
// nadie. Es lo que evita el gasto duplicado cuando dos dispositivos generan la
// misma ocurrencia estando desconectados.
//
// Se arma con SHA-256 y se marca como **version 8**, que es la que RFC 9562
// reserva para los UUID construidos a medida. No es aleatorio y no debe
// parecerlo.
export function idDeterminista(reglaId: string, fecha: string): string {
  const datos = new TextEncoder().encode(`mango:recurring:${reglaId}:${fecha}`)
  const h = sha256(datos).slice(0, 32).split("")
  // version 8
  h[12] = "8"
  // variant RFC 4122 (10xx)
  h[16] = ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16)
  const s = h.join("")
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`
}

// --- Que hay que generar -----------------------------------------------------

// El instante del movimiento: **mediodia local** del dia que toca. A las 00:00
// cualquier corrimiento de zona lo tira al dia anterior, y el mes de un gasto
// es justo lo que no puede bailar (especificacion 8).
function instante(fecha: string): string {
  const [y, m, d] = partes(fecha)
  return new Date(y, m - 1, d, 12, 0, 0).toISOString()
}

// Ocurrencias que le deben a una regla hasta `hasta` inclusive, y donde queda
// su proxima fecha. Una regla pausada o vencida no debe nada.
export function ocurrenciasPendientes(regla: ReglaRecurrente, hasta: string): Pendientes {
  const ocurrencias: Ocurrencia[] = []
  let fecha = regla.next_run_date

  if (!regla.active) return { ocurrencias, proxima: fecha }

  while (fecha <= hasta && (regla.end_date === null || fecha <= regla.end_date)) {
    ocurrencias.push({
      id: idDeterminista(regla.id, fecha),
      regla,
      fecha,
      occurred_at: instante(fecha),
    })
    fecha = siguienteFecha(fecha, regla.frequency, regla.interval_count)
  }

  return { ocurrencias, proxima: fecha }
}

// --- Sobres recurrentes ------------------------------------------------------

export interface ReglaSobre {
  id: string
  category_id: string
  amount: number
  currency: string
  active: number
}

export interface SobrePendiente {
  id: string
  category_id: string
  period_start: string
  amount: number
  currency: string
}

// Primer dia del mes de `fecha`, que es la clave del sobre.
export function inicioDeMes(fecha: string): string {
  const [y, m] = partes(fecha)
  return armar(y, m, 1)
}

// Sobres que faltan crear para el mes de `hasta`.
//
// `existentes` son las claves `categoria|moneda` que ya tienen fila ese mes,
// vengan de una corrida anterior o de una asignacion que cargo la persona. Se
// chequea por esa clave y no por id porque es la que tiene el unico en la base:
// insertar igual crearia una fila que el servidor rechaza y la copia local
// quedaria diciendo otra cosa que la del servidor.
export function sobresPendientes(
  reglas: ReglaSobre[],
  hasta: string,
  existentes: Set<string>,
): SobrePendiente[] {
  const periodo = inicioDeMes(hasta)
  const salida: SobrePendiente[] = []
  for (const r of reglas) {
    if (!r.active) continue
    const clave = `${r.category_id}|${r.currency}`
    if (existentes.has(clave)) continue
    // Tambien determinista, por lo mismo que las transacciones.
    salida.push({
      id: idDeterminista(`sobre:${r.category_id}:${r.currency}`, periodo),
      category_id: r.category_id,
      period_start: periodo,
      amount: r.amount,
      currency: r.currency,
    })
    existentes.add(clave)
  }
  return salida
}
