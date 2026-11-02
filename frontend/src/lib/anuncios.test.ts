import { describe, expect, it } from "vitest"

import { textoGuardado } from "./anuncios"

describe("textoGuardado", () => {
  const base = {
    tipo: "expense",
    monto: "$ 1.500,00",
    grupo: null,
    mes: null,
    ciclo: null,
  } as const

  it("dice que se guardo, donde y cuando", () => {
    expect(textoGuardado(base)).toBe("Gasto de $ 1.500,00 guardado.")
    expect(
      textoGuardado({ ...base, tipo: "transfer", grupo: "Casa", mes: "septiembre de 2026" }),
    ).toBe("Transferencia de $ 1.500,00 guardada en Casa, en septiembre de 2026.")
    expect(textoGuardado({ ...base, mes: "septiembre de 2026" })).toBe(
      "Gasto de $ 1.500,00 guardado en septiembre de 2026.",
    )
  })

  it("sin conexion avisa que falta subirlo", () => {
    expect(textoGuardado({ ...base, tipo: "income", ciclo: "pagado", sinConexion: true })).toBe(
      "Ingreso de $ 1.500,00 guardado. El vencimiento quedó pagado. Se sube cuando vuelva la conexión.",
    )
  })
})
