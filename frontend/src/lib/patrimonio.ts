import type { Conversor } from "@/lib/cotizaciones"
import { factorDe } from "@/lib/dinero"

// Patrimonio unificado: el total en UNA moneda, convirtiendo lo que esta en
// otras con la ultima cotizacion conocida (ver decisiones 0005 y 0031).
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

// Con la ultima cotizacion conocida de cada moneda: `conv` sin fecha (ver
// lib/cotizaciones, que elige el dolar de cada moneda).
export function calcularPatrimonio(
  saldos: SaldoMoneda[],
  destino: string,
  conv: Conversor,
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
    const cot = conv(moneda, objetivo)
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
