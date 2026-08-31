import { describe, expect, it } from "vitest"

import {
  INICIAL,
  type EstadoCalc,
  coma,
  desdeCentavos,
  digito,
  igual,
  operador,
  valorCentavos,
} from "./calculadora"

function tipear(secuencia: Array<(e: EstadoCalc) => EstadoCalc>): EstadoCalc {
  return secuencia.reduce((e, paso) => paso(e), INICIAL)
}

describe("calculadora", () => {
  it("compone un numero con decimales", () => {
    const e = tipear([
      (s) => digito(s, "1"),
      (s) => digito(s, "2"),
      coma,
      (s) => digito(s, "5"),
      (s) => digito(s, "0"),
    ])
    expect(e.entrada).toBe("12,50")
    expect(valorCentavos(e)).toBe(1250)
  })

  it("suma dos montos", () => {
    // 250 + 250 = 500 (dos items de 250)
    const e = tipear([
      (s) => digito(s, "2"),
      (s) => digito(s, "5"),
      (s) => digito(s, "0"),
      (s) => operador(s, "+"),
      (s) => digito(s, "2"),
      (s) => digito(s, "5"),
      (s) => digito(s, "0"),
      igual,
    ])
    expect(valorCentavos(e)).toBe(50000)
  })

  it("multiplica por cantidad", () => {
    // 3 × 250 = 750
    const e = tipear([
      (s) => digito(s, "3"),
      (s) => operador(s, "×"),
      (s) => digito(s, "2"),
      (s) => digito(s, "5"),
      (s) => digito(s, "0"),
      igual,
    ])
    expect(valorCentavos(e)).toBe(75000)
  })

  it("respeta el limite de 2 decimales", () => {
    const e = tipear([
      (s) => digito(s, "1"),
      coma,
      (s) => digito(s, "2"),
      (s) => digito(s, "3"),
      (s) => digito(s, "4"),
    ])
    expect(e.entrada).toBe("1,23")
  })

  it("siembra un monto inicial desde centavos (plantilla)", () => {
    expect(valorCentavos(desdeCentavos(230272))).toBe(230272)
    expect(desdeCentavos(230272).entrada).toBe("2302,72")
    // 0 o negativo -> inicial vacio, listo para escribir encima.
    expect(desdeCentavos(0)).toEqual(INICIAL)
    expect(desdeCentavos(-5)).toEqual(INICIAL)
  })

  it("encadena operaciones izquierda a derecha", () => {
    // 10 + 5 × 2 = 30 (calculadora basica, no precedencia)
    const e = tipear([
      (s) => digito(s, "1"),
      (s) => digito(s, "0"),
      (s) => operador(s, "+"),
      (s) => digito(s, "5"),
      (s) => operador(s, "×"),
      (s) => digito(s, "2"),
      igual,
    ])
    expect(valorCentavos(e)).toBe(3000)
  })
})
