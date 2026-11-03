import { describe, expect, it } from "vitest"

import { aCentesimas, aPartes, leerReparto, repartirPorPesos, splitsDelGrupo } from "@/lib/reparto"

const suma = (xs: number[]) => xs.reduce((s, x) => s + x, 0)

describe("repartir por pesos", () => {
  it("siempre suma exacto el total", () => {
    for (const [total, pesos] of [
      [1000, [1, 1, 1]],
      [100001, [3333, 3333, 3334]],
      [7, [2, 1]],
      [999999999999, [6000, 4000]],
    ] as [number, number[]][])
      expect(suma(repartirPorPesos(total, pesos))).toBe(total)
  })

  it("los centavos que sobran van a la mayor fraccion, y a igual fraccion al primero", () => {
    expect(repartirPorPesos(1000, [1, 1, 1])).toEqual([334, 333, 333])
    expect(repartirPorPesos(10, [2, 1])).toEqual([7, 3])
  })

  it("60/40 y 2 a 1", () => {
    expect(repartirPorPesos(150000, [60, 40])).toEqual([90000, 60000])
    expect(repartirPorPesos(90000, [2, 1])).toEqual([60000, 30000])
  })

  it("a un peso 0 no le toca nada, ni el centavo del redondeo", () => {
    expect(repartirPorPesos(100, [3333, 3333, 3334, 0])).toEqual([33, 33, 34, 0])
    expect(repartirPorPesos(1, [0, 1])).toEqual([0, 1])
  })

  it("sin pesos o sin total, ceros", () => {
    expect(repartirPorPesos(100, [0, 0])).toEqual([0, 0])
    expect(repartirPorPesos(0, [1, 1])).toEqual([0, 0])
  })
})

describe("leer porcentajes y partes", () => {
  it("porcentaje en centesimas, con coma o punto", () => {
    expect(aCentesimas("33,33")).toBe(3333)
    expect(aCentesimas("50")).toBe(5000)
    expect(aCentesimas("12.5")).toBe(1250)
    expect(aCentesimas("100")).toBe(10000)
  })
  it("lo que no es un porcentaje, null", () => {
    expect(aCentesimas("")).toBeNull()
    expect(aCentesimas("1,234")).toBeNull()
    expect(aCentesimas("-5")).toBeNull()
    expect(aCentesimas("abc")).toBeNull()
  })
  it("partes enteras", () => {
    expect(aPartes("2")).toBe(2)
    expect(aPartes("0")).toBe(0)
    expect(aPartes("1,5")).toBeNull()
    expect(aPartes("")).toBeNull()
  })
})

describe("reparto por defecto del grupo", () => {
  it("lee el JSON que baja de la sync", () => {
    expect(leerReparto('{"ana": 60, "beto": 40}')).toEqual({ ana: 60, beto: 40 })
  })
  it("sin reparto o roto: partes iguales (null)", () => {
    expect(leerReparto(null)).toBeNull()
    expect(leerReparto("")).toBeNull()
    expect(leerReparto("no es json")).toBeNull()
    expect(leerReparto("[1, 2]")).toBeNull()
    expect(leerReparto('{"ana": 1.5}')).toBeNull()
    expect(leerReparto('{"ana": 0, "beto": 0}')).toBeNull()
  })
})

describe("gasto del grupo con su reparto, sin editor (recurrentes 1.15.0)", () => {
  it("sin reparto del grupo, igual entre todos: sin filas", () => {
    expect(splitsDelGrupo(1000, ["b", "a"], null)).toBeNull()
  })
  it("60/40 en partes, por id y con los centavos exactos", () => {
    expect(splitsDelGrupo(1001, ["b", "a"], { a: 3, b: 2 })).toEqual([
      { user_id: "a", amount: 601 },
      { user_id: "b", amount: 400 },
    ])
  })
  it("partes iguales es igual entre todos", () => {
    expect(splitsDelGrupo(1000, ["a", "b"], { a: 2, b: 2 })).toBeNull()
  })
  it("quien entro despues de fijar el reparto no paga", () => {
    expect(splitsDelGrupo(900, ["a", "b", "c"], { a: 1, b: 2 })).toEqual([
      { user_id: "a", amount: 300 },
      { user_id: "b", amount: 600 },
    ])
  })
  it("un reparto de gente que ya no esta: igual entre los que quedan", () => {
    expect(splitsDelGrupo(900, ["a", "b"], { z: 1 })).toBeNull()
  })
})
