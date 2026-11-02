import { describe, expect, it } from "vitest"

import { cuentaParaPlantilla, textoCuentaPropuesta } from "./plantillas"

const historial = [
  { category_id: "super", account_id: "billetera", account_name: "Billetera" },
  { category_id: "aysa", account_id: "sueldo", account_name: "Cuenta sueldo" },
  { category_id: "aysa", account_id: "ahorros", account_name: "Ahorros" },
]

describe("cuentaParaPlantilla", () => {
  it("propone la ultima cuenta con la que se pago esa categoria", () => {
    expect(cuentaParaPlantilla(historial, "aysa")).toEqual({
      cuenta: "sueldo",
      nombre: "Cuenta sueldo",
      motivo: "categoria",
    })
  })

  it("sin pagos de esa categoria, la ultima usada en el grupo", () => {
    expect(cuentaParaPlantilla(historial, "edesur")).toEqual({
      cuenta: "billetera",
      nombre: "Billetera",
      motivo: "grupo",
    })
    expect(cuentaParaPlantilla(historial, null)).toEqual({
      cuenta: "billetera",
      nombre: "Billetera",
      motivo: "grupo",
    })
  })

  it("sin nada pagado en el grupo, no propone", () => {
    expect(cuentaParaPlantilla([], "aysa")).toBeNull()
  })
})

describe("textoCuentaPropuesta", () => {
  it("dice por que esa cuenta", () => {
    expect(
      textoCuentaPropuesta({ cuenta: "g", nombre: "Cuenta sueldo", motivo: "categoria" }),
    ).toBe("Cuenta: Cuenta sueldo, la última con la que pagaste esta categoría en el grupo.")
    expect(textoCuentaPropuesta({ cuenta: "g", nombre: "Cuenta sueldo", motivo: "grupo" })).toBe(
      "Cuenta: Cuenta sueldo, la última que usaste en el grupo.",
    )
  })
})
