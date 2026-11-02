import { describe, expect, it } from "vitest"

import { traducirValidacion } from "@/lib/powersync/conector"
import { campoDelMotivo, motivoLegible } from "@/lib/rechazados"

describe("el motivo de un rechazo, para la persona (1.12.0)", () => {
  it("los mensajes comunes de Pydantic, en castellano", () => {
    expect(traducirValidacion("Input should be greater than 0")).toBe("tiene que ser mayor a 0")
    expect(traducirValidacion("Input should be greater than or equal to 1")).toBe(
      "tiene que ser 1 o más",
    )
    expect(traducirValidacion("Field required")).toBe("falta")
    expect(traducirValidacion("algo raro")).toBe("algo raro")
  })

  it("se muestra con el nombre de pantalla, y se sigue marcando el campo", () => {
    const motivo = "amount: tiene que ser mayor a 0"
    expect(motivoLegible(motivo)).toBe("Monto: tiene que ser mayor a 0")
    expect(campoDelMotivo(motivo, { amount: 0 })).toBe("amount")
    expect(motivoLegible("La cuenta no existe")).toBe("La cuenta no existe")
  })
})
