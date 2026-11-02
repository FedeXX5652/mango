import { describe, expect, it } from "vitest"

import { describirCambio } from "@/lib/describirCambio"
import { textoGenerado } from "@/lib/generar"

describe("describirCambio", () => {
  it("un movimiento, con lo que lo identifica", () => {
    expect(
      describirCambio("transactions", "PUT", {
        kind: "expense",
        amount: 150000,
        currency: "ARS",
        payee: "Café",
        occurred_at: "2026-10-12",
      }),
    ).toBe("Gasto nuevo de $ 1.500,00 en Café (12/10/2026)")
    expect(describirCambio("transactions", "PUT", { kind: "transfer", amount: 100 })).toMatch(
      /^Transferencia nueva de /,
    )
    expect(describirCambio("transactions", "DELETE", {})).toBe("Movimiento borrado")
  })

  it("el resto, con su genero y su nombre", () => {
    expect(describirCambio("accounts", "PUT", { name: "Visa" })).toBe("Cuenta nueva «Visa»")
    expect(describirCambio("reminders", "DELETE", { title: "Luz" })).toBe(
      "Recordatorio borrado «Luz»",
    )
    expect(describirCambio("categories", "PATCH", {})).toBe("Cambio en la categoría")
    expect(describirCambio("transaction_payers", "PUT", {})).toBe(
      "Parte de un gasto compartido nueva",
    )
  })

  it("una tabla que no conoce no muestra su nombre interno", () => {
    expect(describirCambio("tabla_rara", "PUT", {})).toBe("Dato nuevo")
  })
})

describe("textoGenerado", () => {
  it("con plurales de verdad y los nombres", () => {
    expect(textoGenerado({ movimientos: 1, sobres: 0, nombres: ["Alquiler"] })).toBe(
      "Se cargó 1 movimiento recurrente: Alquiler.",
    )
    expect(
      textoGenerado({ movimientos: 3, sobres: 2, nombres: ["Alquiler", "Sueldo", "Netflix"] }),
    ).toBe(
      "Se cargaron 3 movimientos recurrentes: Alquiler, Sueldo y Netflix y se asignaron 2 sobres del mes.",
    )
    expect(textoGenerado({ movimientos: 0, sobres: 0, nombres: [] })).toBeNull()
  })

  it("muchos nombres se resumen", () => {
    expect(textoGenerado({ movimientos: 5, sobres: 0, nombres: ["A", "B", "C", "D", "E"] })).toBe(
      "Se cargaron 5 movimientos recurrentes: A, B y 3 más.",
    )
  })
})
