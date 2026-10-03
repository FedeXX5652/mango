// Calculadora de 4 funciones para el campo de monto (DESIGN.md 1: cargar rapido).
// Modelo de calculadora basica: se opera de a un paso, izquierda a derecha.
// La entrada se mantiene como string con coma decimal (formato local) y a lo
// sumo 2 decimales. El valor final se convierte a centavos con aCentavos.

import { aCentavos, aTextoEditable } from "./dinero"

export type Op = "+" | "-" | "×" | "÷"

export interface EstadoCalc {
  entrada: string
  acumulado: number | null
  op: Op | null
  // Tras un operador o igual, el proximo digito reinicia la entrada.
  reiniciar: boolean
}

export const INICIAL: EstadoCalc = { entrada: "0", acumulado: null, op: null, reiniciar: true }

function aNumero(entrada: string): number {
  return Number(entrada.replace(",", "."))
}

export function aEntrada(n: number): string {
  // Redondea a centavos y usa coma decimal, sin decimales sobrantes.
  const r = Math.round(n * 100) / 100
  return r.toString().replace(".", ",")
}

function evaluar(a: number, op: Op, b: number): number {
  const r = op === "+" ? a + b : op === "-" ? a - b : op === "×" ? a * b : b !== 0 ? a / b : 0
  return Math.round(r * 100) / 100
}

// `decimales`: los de la moneda (2 en ARS, 0 en JPY o CLP; lib/dinero).
export function digito(e: EstadoCalc, d: string, decimales = 2): EstadoCalc {
  if (e.reiniciar) return { ...e, entrada: d, reiniciar: false }
  if (e.entrada === "0") return { ...e, entrada: d }
  // No mas decimales que los de la moneda.
  const [, dec] = e.entrada.split(",")
  if (dec !== undefined && dec.length >= decimales) return e
  return { ...e, entrada: e.entrada + d }
}

export function coma(e: EstadoCalc, decimales = 2): EstadoCalc {
  // Una moneda sin decimales no tiene coma que tipear.
  if (decimales === 0) return e
  if (e.reiniciar) return { ...e, entrada: "0,", reiniciar: false }
  if (e.entrada.includes(",")) return e
  return { ...e, entrada: e.entrada + "," }
}

export function operador(e: EstadoCalc, op: Op): EstadoCalc {
  const actual = aNumero(e.entrada)
  // Si habia una operacion pendiente y una entrada nueva, se resuelve primero.
  if (e.op !== null && !e.reiniciar && e.acumulado !== null) {
    const res = evaluar(e.acumulado, e.op, actual)
    return { entrada: aEntrada(res), acumulado: res, op, reiniciar: true }
  }
  return { ...e, acumulado: actual, op, reiniciar: true }
}

export function igual(e: EstadoCalc): EstadoCalc {
  if (e.op === null || e.acumulado === null) return { ...e, reiniciar: true }
  const res = evaluar(e.acumulado, e.op, aNumero(e.entrada))
  return { entrada: aEntrada(res), acumulado: null, op: null, reiniciar: true }
}

export function borrarUltimo(e: EstadoCalc): EstadoCalc {
  if (e.reiniciar || e.entrada.length <= 1) return { ...e, entrada: "0", reiniciar: false }
  return { ...e, entrada: e.entrada.slice(0, -1) }
}

export function limpiar(): EstadoCalc {
  return INICIAL
}

// Lo que vale la cuenta AHORA, con la operacion pendiente resuelta: "100 +"
// vale 100 y "100 + 50" vale 150, sin tocar "=". Es lo que se guarda: antes se
// guardaba solo el numero en pantalla, y "100 + 50" sin "=" quedaba en $50.
export function resultado(e: EstadoCalc): number {
  if (e.op === null || e.acumulado === null) return aNumero(e.entrada)
  if (e.reiniciar) return e.acumulado
  return evaluar(e.acumulado, e.op, aNumero(e.entrada))
}

// En la moneda del movimiento: con la base, un gasto en JPY se guardaba 100
// veces lo tipeado.
export function valorCentavos(e: EstadoCalc, moneda?: string): number {
  return aCentavos(aEntrada(resultado(e)), moneda) ?? 0
}

// La cuenta en curso, para mostrarla arriba del numero ("100 +"). Sin
// operacion pendiente, null. Antes no se veia: tocar "+" no cambiaba nada en
// pantalla y parecia que la tecla no respondia.
export function cuentaEnCurso(e: EstadoCalc): { izquierda: string; op: Op } | null {
  if (e.op === null || e.acumulado === null) return null
  return { izquierda: aEntrada(e.acumulado), op: e.op }
}

// Estado inicial sembrado con un monto (en centavos), p. ej. al aplicar una
// plantilla. Con 0 o negativo, vuelve al inicial vacio.
export function desdeCentavos(centavos: number, moneda?: string): EstadoCalc {
  if (!centavos || centavos <= 0) return INICIAL
  // El texto exacto, sin pasar por un decimal: 230272 -> "2302,72".
  // Sin ceros sobrantes, como lo que se tipea: "1250,50" -> "1250,5".
  const entrada = aTextoEditable(centavos, moneda)
    .replace(/(,\d*?)0+$/, "$1")
    .replace(/,$/, "")
  return { entrada, acumulado: null, op: null, reiniciar: true }
}
