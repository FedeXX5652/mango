import { describe, expect, it } from "vitest"

import {
  INICIAL,
  type EstadoCalc,
  coma,
  cuentaEnCurso,
  desdeCentavos,
  digito,
  igual,
  operador,
  resultado,
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

describe("lo que se guarda es lo que se ve", () => {
  const cien = [
    (s: EstadoCalc) => digito(s, "1"),
    (s: EstadoCalc) => digito(s, "0"),
    (s: EstadoCalc) => digito(s, "0"),
  ]
  const mas = (s: EstadoCalc) => operador(s, "+")
  const cincuenta = [(s: EstadoCalc) => digito(s, "5"), (s: EstadoCalc) => digito(s, "0")]

  it("100 + 50 sin '=' vale 150 (antes guardaba 50)", () => {
    const e = tipear([...cien, mas, ...cincuenta])
    expect(e.entrada).toBe("50")
    expect(resultado(e)).toBe(150)
    expect(valorCentavos(e)).toBe(15000)
  })

  it("'100 +' todavia sin segundo numero vale 100", () => {
    expect(valorCentavos(tipear([...cien, mas]))).toBe(10000)
  })

  it("con '=' sigue valiendo lo mismo", () => {
    expect(valorCentavos(tipear([...cien, mas, ...cincuenta, igual]))).toBe(15000)
  })

  it("encadena de izquierda a derecha: 100 + 50 × 2 = 300", () => {
    const e = tipear([...cien, mas, ...cincuenta, (s) => operador(s, "×"), (s) => digito(s, "2")])
    expect(resultado(e)).toBe(300)
  })

  it("muestra la cuenta en curso, y nada sin operacion", () => {
    expect(cuentaEnCurso(tipear([...cien]))).toBeNull()
    expect(cuentaEnCurso(tipear([...cien, mas, ...cincuenta]))).toEqual({
      izquierda: "100",
      op: "+",
    })
    expect(cuentaEnCurso(tipear([...cien, mas, ...cincuenta, igual]))).toBeNull()
  })
})

describe("calculadora en una moneda sin decimales", () => {
  it("convierte en la moneda del movimiento, no en la base", () => {
    const e = tipear([(s) => digito(s, "1", 0), (s) => digito(s, "5", 0), (s) => digito(s, "0", 0)])
    expect(valorCentavos(e, "JPY")).toBe(150)
    expect(valorCentavos(e, "ARS")).toBe(15000)
  })
  it("no tiene coma", () => {
    const e = tipear([(s) => digito(s, "7", 0), (s) => coma(s, 0), (s) => digito(s, "5", 0)])
    expect(e.entrada).toBe("75")
  })
  it("se siembra con el monto exacto de su moneda", () => {
    expect(desdeCentavos(500, "JPY").entrada).toBe("500")
    expect(desdeCentavos(125050, "ARS").entrada).toBe("1250,5")
    expect(desdeCentavos(150000, "ARS").entrada).toBe("1500")
  })
})
