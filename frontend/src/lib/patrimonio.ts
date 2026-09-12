import { factorDe } from "@/lib/dinero"

// Patrimonio unificado: el total en UNA moneda, convirtiendo lo que esta en
// otras con la ultima cotizacion conocida (ver decision 0005).
//
// La pregunta que contesta es "cuanto vale lo que tengo hoy", asi que usa la
// cotizacion **actual** y por lo tanto fluctua: si tenes dolares y el dolar
// sube, sos mas rico. Lo contrario del gasto historico, que usa la cotizacion
// del momento de cada movimiento y no puede cambiar.
//
// Nada se inventa: si falta la cotizacion de una moneda, ese saldo **no entra**
// en el total y se informa aparte.

export interface SaldoMoneda {
  moneda: string
  // Saldo en unidades menores de `moneda`.
  saldo: number
}

export interface CotizacionConocida {
  base_currency: string
  quote_currency: string
  // Cuantas unidades de `quote` compra 1 de `base`. Texto porque viene de un
  // NUMERIC(20,10) y pasarlo por el float de SQLite le comeria digitos.
  rate: string
  rate_date: string
}

export interface LineaPatrimonio {
  moneda: string
  saldo: number
  // El mismo saldo en la moneda objetivo, en unidades menores. `null` si no hay
  // cotizacion para convertirlo.
  convertido: number | null
  // Fecha de la cotizacion usada; `null` si no hizo falta convertir (la moneda
  // ya era la objetivo) o si falto la cotizacion.
  fecha: string | null
  // true si se uso la cotizacion inversa (habia ARS->USD y se necesitaba
  // USD->ARS). Es correcto pero conviene poder decirlo.
  inversa: boolean
}

export interface Patrimonio {
  // Total en la moneda objetivo, en unidades menores. Solo suma lo convertible.
  total: number
  lineas: LineaPatrimonio[]
  // Monedas que quedaron afuera del total por falta de cotizacion.
  sinCotizacion: string[]
  // La cotizacion mas vieja usada: es el eslabon debil del total y es la fecha
  // que hay que mostrar. `null` si no hubo que convertir nada.
  fecha: string | null
}

// Convierte un saldo entre monedas con una cotizacion. Devuelve unidades
// menores de `destino`, redondeadas.
//
// El paso por numero es inevitable (JS no tiene decimal nativo) pero es seguro:
// el error relativo del float es ~1e-16 y el resultado se redondea a la unidad
// menor, asi que no se ve. Lo que NO se hace es guardar este numero: es un
// valor para mostrar.
export function convertir(saldo: number, origen: string, destino: string, rate: number): number {
  const unidades = saldo / factorDe(origen)
  return Math.round(unidades * rate * factorDe(destino))
}

// Busca la cotizacion del par. Espera `cotizaciones` ordenadas de la fecha mas
// nueva a la mas vieja, que es como las devuelve la consulta.
//
// Con `hasta` devuelve la ultima **anterior o igual** a esa fecha, que es lo que
// necesita un informe historico: lo gastado en marzo se convierte con el dolar
// de marzo, no con el de hoy. Sin `hasta` devuelve la ultima conocida, que es lo
// que necesita el patrimonio.
//
// La comparacion es de texto y eso alcanza: las dos puntas son ISO-8601, asi que
// el orden alfabetico es el cronologico. `hasta` puede venir como fecha
// ("2026-03-11") o como instante ("2026-03-11T14:20:00Z") y en los dos casos una
// cotizacion del mismo dia entra.
//
// Ojo con que se le pasa: para el patrimonio, `ultimaPorPar` (una por par); para
// un informe historico, **la serie completa**, si no no hay de donde elegir.
export interface CotizacionUsada {
  rate: number
  // La fecha del dato. En una compuesta, la MAS VIEJA de las dos patas: el
  // resultado no es mas fresco que su peor insumo.
  fecha: string
  // Se leyo el par al reves (habia ARS->USD y se necesitaba USD->ARS).
  inversa: boolean
  // Moneda por la que se paso para componerla, si hubo que componer.
  via: string | null
}

// Par directo o invertido, sin componer. Es el primitivo.
function directaOInversa(
  origen: string,
  destino: string,
  cotizaciones: CotizacionConocida[],
  hasta?: string,
): { rate: number; fecha: string; inversa: boolean } | null {
  const vale = (c: CotizacionConocida) => hasta === undefined || c.rate_date <= hasta
  // Directa: 1 origen = rate destino.
  const directa = cotizaciones.find(
    (c) => c.base_currency === origen && c.quote_currency === destino && vale(c),
  )
  if (directa) {
    const rate = Number(directa.rate)
    if (rate > 0) return { rate, fecha: directa.rate_date, inversa: false }
  }
  // Inversa: hay 1 destino = rate origen, asi que 1 origen = 1/rate destino.
  const inversa = cotizaciones.find(
    (c) => c.base_currency === destino && c.quote_currency === origen && vale(c),
  )
  if (inversa) {
    const rate = Number(inversa.rate)
    if (rate > 0) return { rate: 1 / rate, fecha: inversa.rate_date, inversa: true }
  }
  return null
}

export function buscarCotizacion(
  origen: string,
  destino: string,
  cotizaciones: CotizacionConocida[],
  hasta?: string,
): CotizacionUsada | null {
  const par = directaOInversa(origen, destino, cotizaciones, hasta)
  if (par) return { ...par, via: null }

  // Componer por una tercera moneda. Hace falta de verdad: el refresco guarda
  // **todo contra la moneda base** (una llamada por moneda, ver 0005), asi que
  // con base ARS existen USD->ARS y MXN->ARS pero jamas USD->MXN. Leer el
  // patrimonio en dolares dejaba los pesos mexicanos afuera por un dato que ya
  // estaba: 1 USD = 1509,91 ARS y 1 MXN = 88,96 ARS dan 1 USD = 16,97 MXN.
  //
  // Componer no es inventar una cotizacion: es la misma operacion que leer un
  // par al reves, con un paso mas. Y sigue siendo solo para **ver**: registrar
  // un movimiento nunca usa la serie (0005 punto 7).
  const pivotes = new Set<string>()
  for (const c of cotizaciones) {
    pivotes.add(c.base_currency)
    pivotes.add(c.quote_currency)
  }
  pivotes.delete(origen)
  pivotes.delete(destino)

  let mejor: CotizacionUsada | null = null
  // Orden alfabetico para que dos cadenas igual de frescas den siempre lo
  // mismo; si no, el total cambiaria segun como vino ordenada la consulta.
  for (const via of [...pivotes].sort()) {
    const a = directaOInversa(origen, via, cotizaciones, hasta)
    if (!a) continue
    const b = directaOInversa(via, destino, cotizaciones, hasta)
    if (!b) continue
    // 1 origen = a.rate via, y 1 via = b.rate destino.
    const rate = a.rate * b.rate
    if (!(rate > 0)) continue
    const fecha = a.fecha < b.fecha ? a.fecha : b.fecha
    // Entre varias cadenas posibles gana la del eslabon debil mas nuevo.
    if (mejor === null || fecha > mejor.fecha) {
      mejor = { rate, fecha, inversa: false, via }
    }
  }
  return mejor
}

// `cotizaciones` tiene que traer UNA por par: la ultima conocida. La consulta
// las trae ordenadas por fecha descendente y se queda con la primera de cada
// par (ver `ultimaPorPar`).
export function calcularPatrimonio(
  saldos: SaldoMoneda[],
  destino: string,
  cotizaciones: CotizacionConocida[],
): Patrimonio {
  const objetivo = destino.trim().toUpperCase()
  const lineas: LineaPatrimonio[] = []
  const sinCotizacion: string[] = []
  let total = 0
  let fecha: string | null = null

  for (const s of saldos) {
    const moneda = s.moneda.toUpperCase()
    if (moneda === objetivo) {
      total += s.saldo
      lineas.push({ moneda, saldo: s.saldo, convertido: s.saldo, fecha: null, inversa: false })
      continue
    }
    const cot = buscarCotizacion(moneda, objetivo, cotizaciones)
    if (!cot) {
      sinCotizacion.push(moneda)
      lineas.push({ moneda, saldo: s.saldo, convertido: null, fecha: null, inversa: false })
      continue
    }
    const convertido = convertir(s.saldo, moneda, objetivo, cot.rate)
    total += convertido
    lineas.push({
      moneda,
      saldo: s.saldo,
      convertido,
      fecha: cot.fecha,
      inversa: cot.inversa,
    })
    // La mas vieja manda: el total no es mas fresco que su peor dato.
    if (fecha === null || cot.fecha < fecha) fecha = cot.fecha
  }

  return { total, lineas, sinCotizacion, fecha }
}

// Se queda con la ultima cotizacion de cada par. Espera las filas ordenadas de
// la fecha mas nueva a la mas vieja, que es como las devuelve la consulta.
export function ultimaPorPar(filas: CotizacionConocida[]): CotizacionConocida[] {
  const vistas = new Set<string>()
  const salida: CotizacionConocida[] = []
  for (const f of filas) {
    const clave = `${f.base_currency}|${f.quote_currency}`
    if (vistas.has(clave)) continue
    vistas.add(clave)
    salida.push(f)
  }
  return salida
}

// ---------------------------------------------------------------------------
// Flujos (ingresos, egresos) del periodo: se convierten con la MISMA cotizacion
// que el patrimonio, la ultima conocida.
//
// Es la respuesta a "cuanto tengo y como vino el mes, expresado en esta moneda,
// hoy": una sola cotizacion para todo, como si cambiaras todo ahora. Que el
// patrimonio use una y los flujos otra mezclaria dos valuaciones en el mismo
// bloque.
//
// La cotizacion del **momento de cada movimiento** es para otra pregunta —
// "cuanto me costo en marzo", que no puede cambiar porque hoy salto el dolar —
// y esa vive en los informes historicos, con `transactions.exchange_rate`
// (ver 0005).
//
// Por eso no hay una funcion aparte: los flujos se agrupan por moneda y pasan
// por `calcularPatrimonio`, que es exactamente esta operacion.
