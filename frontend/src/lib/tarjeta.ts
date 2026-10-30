// Tarjeta de credito (0034): las fechas del resumen, las cuotas, lo que vence y el
// disponible. Funciones puras sobre fechas "YYYY-MM-DD" (dia local, ver
// lib/fecha) y centavos enteros (regla 1): nada de punto flotante.

// --- Fechas ----------------------------------------------------------------------

// Un dia que el mes no tiene cae en el ultimo: el cierre "31" de febrero es el 28
// (o el 29).
function diaEnMes(anio: number, mes0: number, dia: number): number {
  const ultimo = new Date(anio, mes0 + 1, 0).getDate()
  return Math.min(dia, ultimo)
}

function iso(anio: number, mes0: number, dia: number): string {
  // El mes puede venir corrido (13, -1): Date lo normaliza.
  const d = new Date(anio, mes0, 1)
  const a = d.getFullYear()
  const m = d.getMonth()
  const dd = diaEnMes(a, m, dia)
  return `${a}-${String(m + 1).padStart(2, "0")}-${String(dd).padStart(2, "0")}`
}

function partes(fecha: string): [number, number, number] {
  const [a, m, d] = fecha.slice(0, 10).split("-").map(Number)
  return [a, m - 1, d]
}

// El cierre del mes de `fecha` corrido `meses` meses.
function cierreDelMes(fecha: string, dia: number, meses = 0): string {
  const [a, m] = partes(fecha)
  return iso(a, m + meses, dia)
}

/** El ultimo cierre en o antes de `hoy`. Un resumen incluye su dia de cierre. */
export function ultimoCierre(hoy: string, diaCierre: number): string {
  const esteMes = cierreDelMes(hoy, diaCierre)
  return esteMes <= hoy ? esteMes : cierreDelMes(hoy, diaCierre, -1)
}

/** El primer cierre en o despues de `fecha`: el resumen donde entra una compra. */
export function cierreDeLaCompra(fecha: string, diaCierre: number): string {
  const esteMes = cierreDelMes(fecha, diaCierre)
  return esteMes >= fecha ? esteMes : cierreDelMes(fecha, diaCierre, 1)
}

/** El vencimiento del resumen que cerro en `cierre`: el primer dia de
 *  vencimiento despues del cierre. */
export function vencimientoDe(cierre: string, diaVence: number): string {
  const esteMes = cierreDelMes(cierre, diaVence)
  return esteMes > cierre ? esteMes : cierreDelMes(cierre, diaVence, 1)
}

// --- Cuotas ----------------------------------------------------------------------

/** El total en `n` cuotas iguales que suman exacto; la primera lleva los
 *  centavos que sobran, como en el resumen del banco. */
export function repartirCuotas(total: number, n: number): number[] {
  const cuotas = Math.max(1, Math.floor(n))
  const base = Math.floor(total / cuotas)
  return Array.from({ length: cuotas }, (_, i) => (i === 0 ? total - base * (cuotas - 1) : base))
}

// Un movimiento de la tarjeta, visto desde su saldo. `efecto` es lo que le hace
// al saldo: un gasto resta (negativo), un pago suma.
export interface MovTarjeta {
  fecha: string
  efecto: number
  // Solo una compra se factura por cuotas. Lo demas (pagos, devoluciones,
  // ajustes del banco, 0033) cuenta como facturado en su fecha.
  compra: boolean
  cuotas: number | null
}

/** Lo que todavia no entro en ningun resumen: las compras posteriores al
 *  ultimo cierre y las cuotas futuras de las anteriores. Positivo. */
export function noFacturado(movs: MovTarjeta[], diaCierre: number, hoy: string): number {
  const cerrado = ultimoCierre(hoy, diaCierre)
  let total = 0
  for (const m of movs) {
    if (!m.compra || m.efecto >= 0) continue
    const primera = cierreDeLaCompra(m.fecha, diaCierre)
    repartirCuotas(-m.efecto, m.cuotas ?? 1).forEach((cuota, k) => {
      if (cierreDelMes(primera, diaCierre, k) > cerrado) total += cuota
    })
  }
  return total
}

// --- Lo que se debe y lo que vence -----------------------------------------------

export interface EstadoTarjeta {
  // Lo que se debe en total (0 si esta a favor).
  deuda: number
  // Saldo a favor (pago de mas o devolucion), 0 si se debe.
  aFavor: number
  // Lo que vence del ultimo resumen cerrado y todavia no se pago. Sin dia de
  // cierre no se sabe: null.
  resumen: number | null
  cierre: string | null
  vence: string | null
  proximoCierre: string | null
}

/** El estado de un saldo de la tarjeta. `saldo` es el de la cuenta (negativo si
 *  se debe). Lo que vence = deuda total - lo no facturado (0034, 5): los pagos ya
 *  bajaron la deuda, asi que se descuentan solos. */
export function estadoTarjeta(
  saldo: number,
  movs: MovTarjeta[],
  dias: { cierre: number | null; vence: number | null },
  hoy: string,
): EstadoTarjeta {
  const deuda = Math.max(0, -saldo)
  const aFavor = Math.max(0, saldo)
  if (dias.cierre == null) {
    return { deuda, aFavor, resumen: null, cierre: null, vence: null, proximoCierre: null }
  }
  const cierre = ultimoCierre(hoy, dias.cierre)
  const pendiente = deuda - noFacturado(movs, dias.cierre, hoy)
  return {
    deuda,
    aFavor,
    resumen: Math.min(deuda, Math.max(0, pendiente)),
    cierre,
    vence: dias.vence == null ? null : vencimientoDe(cierre, dias.vence),
    proximoCierre: cierreDelMes(cierre, dias.cierre, 1),
  }
}

/** Disponible = limite - deuda de la principal - deuda de los otros saldos ya
 *  convertida a la moneda del limite (con el dolar tarjeta, 0031). Puede dar
 *  negativo: el banco deja pasarse; la app solo lo informa. */
export function disponible(
  limite: number,
  deudaPrincipal: number,
  otrasConvertidas: number[],
): number {
  return limite - deudaPrincipal - otrasConvertidas.reduce((s, d) => s + d, 0)
}

/** Las cuotas que se ofrecen al cargar un gasto con tarjeta. 1 = sin cuotas. */
export const CUOTAS = [1, 2, 3, 4, 5, 6, 9, 10, 12, 18, 24]

/** Las opciones del selector de cuotas, con la guardada si no es de las comunes. */
export function opcionesCuotas(actual: number): { id: string; nombre: string }[] {
  const lista = CUOTAS.includes(actual) ? CUOTAS : [...CUOTAS, actual].sort((a, b) => a - b)
  return lista.map((n) => ({ id: String(n), nombre: n === 1 ? "Sin cuotas" : `${n} cuotas` }))
}

/** "Visa ···1234 · cierra el 24 · vence el 5": la tarjeta en una linea. */
export function descripcionTarjeta(t: {
  brand: string | null
  last4: string | null
  closing_day: number | null
  due_day: number | null
}): string {
  const partes = [
    [t.brand, t.last4 ? `···${t.last4}` : null].filter(Boolean).join(" "),
    t.closing_day ? `cierra el ${t.closing_day}` : null,
    t.due_day ? `vence el ${t.due_day}` : null,
  ].filter(Boolean)
  return partes.length > 0 ? partes.join(" · ") : "Tarjeta de crédito"
}
