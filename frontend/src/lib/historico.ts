import { type CotizacionConocida, buscarCotizacion, convertir } from "@/lib/patrimonio"

// Informes historicos: cuanto gaste, expresado en UNA moneda, con la cotizacion
// **del momento de cada movimiento** (ver decision 0005 punto 3).
//
// Es la pregunta opuesta a la del patrimonio. El patrimonio vale lo que vale
// hoy y fluctua; lo gastado en marzo ya paso y **no puede cambiar porque hoy
// salto el dolar**. Convertir el historico con la ultima cotizacion es el error
// clasico: reescribe el pasado cada vez que se abre la pantalla.
//
// De donde sale el numero, en orden. Los dos primeros son exactos y no miran
// ninguna cotizacion:
//
//   1. propia      el movimiento ya esta en la moneda pedida -> `amount`
//   2. movimiento  la cuenta debitada esta en la moneda pedida y hay
//                  `amount_account` -> ese monto, que es el del resumen del banco
//   3. serie       `exchange_rates` a la fecha del movimiento
//   4. nada        queda AFUERA del total y se informa (no se estima)
//
// El caso 2 es lo que paga el tipo de cambio por movimiento: alguien en pesos
// con compras en dolares con la tarjeta obtiene el numero **real** que le
// cobraron, sin buscar cotizacion alguna. Es mas exacto que la serie, no un
// atajo.

export type FuenteConversion = "propia" | "movimiento" | "serie"

// Lo minimo que hace falta de un movimiento para convertirlo. `moneda_cuenta`
// es la moneda de `account_id`, que viene del join con `accounts`.
export interface MovimientoConvertible {
  // En unidades menores de `currency`.
  amount: number
  currency: string
  occurred_at: string
  // Lo que salio de la cuenta, en unidades menores de `moneda_cuenta`. NULL
  // cuando no hubo conversion, o cuando falta el dato del resumen.
  amount_account: number | null
  moneda_cuenta: string | null
}

export interface Convertido {
  // En unidades menores de la moneda pedida.
  centavos: number
  fuente: FuenteConversion
  // Fecha de la cotizacion usada; `null` cuando no hizo falta ninguna.
  fecha: string | null
}

// Devuelve `null` cuando no hay con que convertir: el movimiento no entra en el
// total y quien llama lo informa. Un total con una conversion inventada es peor
// que un total incompleto.
export function convertirMovimiento(
  mov: MovimientoConvertible,
  destino: string,
  cotizaciones: CotizacionConocida[],
): Convertido | null {
  const objetivo = destino.trim().toUpperCase()
  const moneda = mov.currency.trim().toUpperCase()

  if (moneda === objetivo) {
    return { centavos: mov.amount, fuente: "propia", fecha: null }
  }

  // El monto debitado sirve solo si la cuenta esta justo en la moneda pedida:
  // esta en SUS unidades menores, no en las de `objetivo`.
  const monedaCuenta = mov.moneda_cuenta?.trim().toUpperCase() ?? null
  if (monedaCuenta === objetivo && mov.amount_account !== null && mov.amount_account > 0) {
    return { centavos: mov.amount_account, fuente: "movimiento", fecha: null }
  }

  // A la fecha del movimiento, nunca la ultima conocida.
  const cot = buscarCotizacion(moneda, objetivo, cotizaciones, mov.occurred_at)
  if (!cot) return null

  return {
    centavos: convertir(mov.amount, moneda, objetivo, cot.rate),
    fuente: "serie",
    fecha: cot.fecha,
  }
}

export interface FilaConvertida<T> {
  fila: T
  // `null` si no se pudo convertir.
  convertido: number | null
}

export interface ListaConvertida<T> {
  filas: FilaConvertida<T>[]
  // Monedas que quedaron afuera por falta de cotizacion, ordenadas y sin
  // repetir. Es lo que la pantalla informa al pie.
  sinCotizacion: string[]
}

// Convierte una lista entera y junta las monedas que quedaron afuera. Existe
// para que cada agregado de la pantalla (por categoria, por mes, por etiqueta)
// no repita el descarte por su cuenta y termine informando cosas distintas.
export function convertirTodos<T extends MovimientoConvertible>(
  movimientos: T[],
  destino: string,
  cotizaciones: CotizacionConocida[],
): ListaConvertida<T> {
  const sin = new Set<string>()
  const filas = movimientos.map((fila) => {
    const r = convertirMovimiento(fila, destino, cotizaciones)
    if (r === null) sin.add(fila.currency.trim().toUpperCase())
    return { fila, convertido: r?.centavos ?? null }
  })
  return { filas, sinCotizacion: [...sin].sort() }
}
