// Calculadora de 4 funciones para el campo de monto (DESIGN.md 1: cargar rapido).
// Modelo de calculadora basica: se opera de a un paso, izquierda a derecha.
// La entrada se mantiene como string con coma decimal (formato local) y a lo
// sumo 2 decimales. El valor final se convierte a centavos con aCentavos.

import { aCentavos } from "./dinero"

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

function aEntrada(n: number): string {
  // Redondea a centavos y usa coma decimal, sin decimales sobrantes.
  const r = Math.round(n * 100) / 100
  return r.toString().replace(".", ",")
}

function evaluar(a: number, op: Op, b: number): number {
  const r = op === "+" ? a + b : op === "-" ? a - b : op === "×" ? a * b : b !== 0 ? a / b : 0
  return Math.round(r * 100) / 100
}

export function digito(e: EstadoCalc, d: string): EstadoCalc {
  if (e.reiniciar) return { ...e, entrada: d, reiniciar: false }
  if (e.entrada === "0") return { ...e, entrada: d }
  // Limite de 2 decimales.
  const [, dec] = e.entrada.split(",")
  if (dec !== undefined && dec.length >= 2) return e
  return { ...e, entrada: e.entrada + d }
}

export function coma(e: EstadoCalc): EstadoCalc {
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

export function valorCentavos(e: EstadoCalc): number {
  return aCentavos(e.entrada) ?? 0
}
