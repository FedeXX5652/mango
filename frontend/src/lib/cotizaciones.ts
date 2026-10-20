import { fechaISO } from "@/lib/fecha"

// Cotizaciones para VER (1.7.0, ver 0031; antes 0005): convertir el patrimonio y
// los informes. Registrar un movimiento nunca usa esto: manda el monto debitado.
//
// **La serie automatica va toda contra el dolar.** El servidor guarda USD -> ARS
// por cada dolar argentino (`casa`: oficial, mep, blue, tarjeta) y USD -> X para
// las demas monedas. Cualquier conversion se arma aca, al leer:
//
//   A -> B  =  (1 A en dolares) / (1 B en dolares)
//
// Euro a pesos = euro -> dolar x dolar -> pesos, con **el dolar que la persona
// eligio para el euro** (`users.fx_dolar`, MEP por defecto). Por eso cambiar la
// moneda base no obliga a regenerar nada.
//
// **Lo cargado a mano gana en su fecha.** Para cada conversion se miran las dos
// cosas, lo cargado a mano para ese par y el camino automatico, y gana la mas
// nueva; a igual fecha, la cargada a mano. Una moneda "a mano"
// (`users.fx_manual`) usa solo lo cargado a mano.
//
// Las series se indexan por par y fecha, y la busqueda es binaria: un informe
// convierte cientos de movimientos contra miles de filas.

export type Casa = "oficial" | "mep" | "blue" | "tarjeta"

export const CASAS: { id: Casa; nombre: string }[] = [
  { id: "oficial", nombre: "Oficial" },
  { id: "mep", nombre: "MEP" },
  { id: "blue", nombre: "Blue" },
  { id: "tarjeta", nombre: "Tarjeta" },
]

export const CASA_POR_DEFECTO: Casa = "mep"

export function nombreCasa(casa: string | null | undefined): string {
  return CASAS.find((c) => c.id === casa)?.nombre ?? ""
}

// Lo que hace falta de cada fila. `rate` es texto: viene de un NUMERIC(20,10) y
// el float de SQLite le comeria digitos.
export interface FilaCotizacion {
  base_currency: string
  quote_currency: string
  rate: string
  rate_date: string
  // 'auto' es automatica; cualquier otro valor, cargada a mano.
  source: string
  casa: string | null
  created_at?: string | null
}

export const SQL_COTIZACIONES = `
  SELECT base_currency, quote_currency, rate, rate_date, source, casa, created_at
  FROM exchange_rates WHERE deleted_at IS NULL`

export interface PreferenciasFx {
  // {moneda: dolar}: con que dolar se convierte cada moneda a pesos. La clave es
  // la moneda que no es el peso.
  dolar: Record<string, Casa>
  // Las monedas "a mano".
  manuales: string[]
}

export const SIN_PREFERENCIAS: PreferenciasFx = { dolar: {}, manuales: [] }

export interface CotizacionUsada {
  // 1 origen = rate destino.
  rate: number
  // La fecha del dato. Si se compuso, la MAS VIEJA de las patas: el resultado no
  // es mas fresco que su peor insumo.
  fecha: string
  // Se leyo un par cargado a mano al reves.
  inversa: boolean
  // Moneda por la que se paso, si se compuso.
  via: string | null
  // El dolar con que se paso por el peso, si se paso.
  casa: Casa | null
  manual: boolean
}

interface Punto {
  fecha: string
  rate: number
}

export interface Indice {
  // `${base}|${quote}|${clase}`: clase "m" (a mano) o "a:<casa>" (automatica;
  // "a:" sin dolar). Cada serie va por fecha ascendente, una por fecha.
  series: Map<string, Punto[]>
  // Monedas con algo cargado a mano: los pivotes para componer a mano.
  conManual: Set<string>
}

function clave(base: string, quote: string, clase: string): string {
  return `${base}|${quote}|${clase}`
}

export function indexar(filas: FilaCotizacion[]): Indice {
  const crudas = new Map<string, { fecha: string; rate: number; orden: string }[]>()
  const conManual = new Set<string>()
  for (const f of filas) {
    const rate = Number(f.rate)
    if (!(rate > 0)) continue
    const base = f.base_currency.trim().toUpperCase()
    const quote = f.quote_currency.trim().toUpperCase()
    const manual = f.source !== "auto"
    if (manual) {
      conManual.add(base)
      conManual.add(quote)
    }
    const k = clave(base, quote, manual ? "m" : `a:${f.casa ?? ""}`)
    const lista = crudas.get(k) ?? []
    lista.push({ fecha: f.rate_date.slice(0, 10), rate, orden: f.created_at ?? "" })
    crudas.set(k, lista)
  }
  const series = new Map<string, Punto[]>()
  for (const [k, lista] of crudas) {
    // Por fecha y, a igual fecha, la ultima cargada: queda una por fecha.
    lista.sort((a, b) =>
      a.fecha === b.fecha ? a.orden.localeCompare(b.orden) : a.fecha < b.fecha ? -1 : 1,
    )
    const una: Punto[] = []
    for (const p of lista) {
      if (una.length > 0 && una[una.length - 1].fecha === p.fecha) una[una.length - 1] = p
      else una.push({ fecha: p.fecha, rate: p.rate })
    }
    series.set(k, una)
  }
  return { series, conManual }
}

// El ultimo punto con fecha <= hasta (sin `hasta`, el ultimo de todos).
function hastaFecha(serie: Punto[] | undefined, hasta: string | undefined): Punto | null {
  if (!serie || serie.length === 0) return null
  if (hasta === undefined) return serie[serie.length - 1]
  let lo = 0
  let hi = serie.length - 1
  let res = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (serie[mid].fecha <= hasta) {
      res = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return res >= 0 ? serie[res] : null
}

// `hasta` puede venir como fecha o como instante de un movimiento: el instante se
// lleva al dia LOCAL (un gasto de las 22 del 31 usa el dolar del 31, no el del 1).
export function aDia(hasta: string | undefined): string | undefined {
  if (hasta === undefined || hasta.length <= 10) return hasta
  const d = new Date(hasta)
  return Number.isNaN(d.getTime()) ? hasta.slice(0, 10) : fechaISO(d)
}

function masVieja(a: string | null, b: string | null): string | null {
  if (a === null) return b
  if (b === null) return a
  return a < b ? a : b
}

// Un par cargado a mano, directo o al reves; el mas nuevo de los dos.
function aMano(
  origen: string,
  destino: string,
  ind: Indice,
  hasta?: string,
): CotizacionUsada | null {
  const d = hastaFecha(ind.series.get(clave(origen, destino, "m")), hasta)
  const i = hastaFecha(ind.series.get(clave(destino, origen, "m")), hasta)
  if (d && (!i || d.fecha >= i.fecha)) {
    return { rate: d.rate, fecha: d.fecha, inversa: false, via: null, casa: null, manual: true }
  }
  if (i)
    return { rate: 1 / i.rate, fecha: i.fecha, inversa: true, via: null, casa: null, manual: true }
  return null
}

// Componer a mano por una tercera moneda: lo de antes de la 1.7.0, para quien
// carga todo a mano (con base ARS hay USD -> ARS y MXN -> ARS, pero no USD ->
// MXN). Entre varias cadenas gana la del eslabon debil mas nuevo; a igual fecha,
// la de la moneda que va primero en el alfabeto, para que el total no dependa
// del orden de la consulta.
function componerAMano(
  origen: string,
  destino: string,
  ind: Indice,
  hasta?: string,
): CotizacionUsada | null {
  let mejor: CotizacionUsada | null = null
  for (const via of [...ind.conManual].sort()) {
    if (via === origen || via === destino) continue
    const a = aMano(origen, via, ind, hasta)
    if (!a) continue
    const b = aMano(via, destino, ind, hasta)
    if (!b) continue
    const fecha = a.fecha < b.fecha ? a.fecha : b.fecha
    if (mejor === null || fecha > mejor.fecha) {
      mejor = { rate: a.rate * b.rate, fecha, inversa: false, via, casa: null, manual: true }
    }
  }
  return mejor
}

// 1 `moneda` en dolares, de la serie automatica. `fecha` null = no hizo falta
// ningun dato (es el dolar). Si el dolar elegido no tiene dato a esa fecha (el
// MEP empieza en 2018), se usa el oficial.
function enDolares(
  moneda: string,
  casa: Casa,
  ind: Indice,
  hasta?: string,
): { rate: number; fecha: string | null; casa: Casa | null } | null {
  if (moneda === "USD") return { rate: 1, fecha: null, casa: null }
  if (moneda === "ARS") {
    for (const c of casa === "oficial" ? [casa] : [casa, "oficial" as Casa]) {
      const p = hastaFecha(ind.series.get(clave("USD", "ARS", `a:${c}`)), hasta)
      if (p) return { rate: 1 / p.rate, fecha: p.fecha, casa: c }
    }
    return null
  }
  const d = hastaFecha(ind.series.get(clave("USD", moneda, "a:")), hasta)
  const i = hastaFecha(ind.series.get(clave(moneda, "USD", "a:")), hasta)
  if (d && (!i || d.fecha >= i.fecha)) return { rate: 1 / d.rate, fecha: d.fecha, casa: null }
  if (i) return { rate: i.rate, fecha: i.fecha, casa: null }
  return null
}

function automatica(
  origen: string,
  destino: string,
  ind: Indice,
  prefs: PreferenciasFx,
  hasta?: string,
): CotizacionUsada | null {
  // El dolar lo decide la moneda que no es el peso.
  const otra = origen === "ARS" ? destino : origen
  const casa = prefs.dolar[otra] ?? CASA_POR_DEFECTO
  const o = enDolares(origen, casa, ind, hasta)
  if (!o) return null
  const d = enDolares(destino, casa, ind, hasta)
  if (!d) return null
  const fecha = masVieja(o.fecha, d.fecha)
  if (fecha === null) return null
  return {
    rate: o.rate / d.rate,
    fecha,
    inversa: false,
    via: origen !== "USD" && destino !== "USD" ? "USD" : null,
    casa: o.casa ?? d.casa,
    manual: false,
  }
}

// La cotizacion para leer 1 `origen` en `destino`, a una fecha (o la ultima).
export function cotizar(
  origen: string,
  destino: string,
  ind: Indice,
  prefs: PreferenciasFx,
  hasta?: string,
): CotizacionUsada | null {
  const o = origen.trim().toUpperCase()
  const d = destino.trim().toUpperCase()
  const h = aDia(hasta)
  const manual = aMano(o, d, ind, h)
  if (prefs.manuales.includes(o) || prefs.manuales.includes(d)) {
    return manual ?? componerAMano(o, d, ind, h)
  }
  const auto = automatica(o, d, ind, prefs, h)
  if (manual && (!auto || manual.fecha >= auto.fecha)) return manual
  return auto ?? componerAMano(o, d, ind, h)
}

// Solo la serie automatica, con un dolar dado: para comparar los dolares en la
// pantalla, aunque haya algo cargado a mano.
export function cotizarConDolar(
  origen: string,
  destino: string,
  ind: Indice,
  casa: Casa,
  hasta?: string,
): CotizacionUsada | null {
  const o = origen.trim().toUpperCase()
  const d = destino.trim().toUpperCase()
  const otra = o === "ARS" ? d : o
  return automatica(o, d, ind, { dolar: { [otra]: casa }, manuales: [] }, aDia(hasta))
}

// Lo que usan el patrimonio y los informes: la cotizacion ya resuelta con las
// preferencias del usuario.
export type Conversor = (origen: string, destino: string, hasta?: string) => CotizacionUsada | null

export function conversor(ind: Indice, prefs: PreferenciasFx): Conversor {
  return (origen, destino, hasta) => cotizar(origen, destino, ind, prefs, hasta)
}

// El ultimo valor de cada dolar: "Oficial 1.535 · MEP 1.542,90 · …".
export function dolaresDelDia(ind: Indice): { casa: Casa; rate: number; fecha: string }[] {
  const salida: { casa: Casa; rate: number; fecha: string }[] = []
  for (const { id } of CASAS) {
    const p = hastaFecha(ind.series.get(clave("USD", "ARS", `a:${id}`)), undefined)
    if (p) salida.push({ casa: id, rate: p.rate, fecha: p.fecha })
  }
  return salida
}

// La serie de 1 `origen` en `destino`, un punto por dia entre `desde` y `hasta`
// (fechas YYYY-MM-DD), para el grafico. Los dias sin dato toman el ultimo
// anterior, como cualquier conversion; antes del primer dato no hay punto.
export function serieDiaria(
  origen: string,
  destino: string,
  ind: Indice,
  prefs: PreferenciasFx,
  desde: string,
  hasta: string,
): { fecha: string; rate: number }[] {
  const salida: { fecha: string; rate: number }[] = []
  const [y, m, d] = desde.split("-").map(Number)
  const dia = new Date(y, m - 1, d)
  for (let f = fechaISO(dia); f <= hasta; dia.setDate(dia.getDate() + 1), f = fechaISO(dia)) {
    const c = cotizar(origen, destino, ind, prefs, f)
    if (c) salida.push({ fecha: f, rate: c.rate })
  }
  return salida
}
