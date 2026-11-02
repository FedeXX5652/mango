import { describe, expect, it } from "vitest"

import { cuentaParaPlantilla, textoCuentaPropuesta } from "./plantillas"

const historial = [
  { category_id: "super", account_id: "mp", account_name: "Mercado Pago" },
  { category_id: "aysa", account_id: "galicia", account_name: "Galicia" },
  { category_id: "aysa", account_id: "bbva", account_name: "BBVA" },
]

describe("cuentaParaPlantilla", () => {
  it("propone la ultima cuenta con la que se pago esa categoria", () => {
    expect(cuentaParaPlantilla(historial, "aysa")).toEqual({
      cuenta: "galicia",
      nombre: "Galicia",
      motivo: "categoria",
    })
  })

  it("sin pagos de esa categoria, la ultima usada en el grupo", () => {
    expect(cuentaParaPlantilla(historial, "edesur")).toEqual({
      cuenta: "mp",
      nombre: "Mercado Pago",
      motivo: "grupo",
    })
    expect(cuentaParaPlantilla(historial, null)).toEqual({
      cuenta: "mp",
      nombre: "Mercado Pago",
      motivo: "grupo",
    })
  })

  it("sin nada pagado en el grupo, no propone", () => {
    expect(cuentaParaPlantilla([], "aysa")).toBeNull()
  })
})

describe("textoCuentaPropuesta", () => {
  it("dice por que esa cuenta", () => {
    expect(textoCuentaPropuesta({ cuenta: "g", nombre: "Galicia", motivo: "categoria" })).toBe(
      "Cuenta: Galicia, la última con la que pagaste esta categoría en el grupo.",
    )
    expect(textoCuentaPropuesta({ cuenta: "g", nombre: "Galicia", motivo: "grupo" })).toBe(
      "Cuenta: Galicia, la última que usaste en el grupo.",
    )
  })
})
