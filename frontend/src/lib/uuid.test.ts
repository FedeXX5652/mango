import { describe, expect, it } from "vitest"

import { uuidv5 } from "@/lib/uuid"

// Valores de referencia: uuid.uuid5 de la biblioteca de Python.
const DNS = "6ba7b810-9dad-11d1-80b4-00c04fd430c8"

describe("uuidv5", () => {
  it("coincide con el ejemplo de la RFC/Python", () => {
    expect(uuidv5(DNS, "python.org")).toBe("886313e1-3b8a-5372-9b90-0c9aee199e5d")
  })
  it("nombre vacio y en el borde de un bloque de SHA-1", () => {
    expect(uuidv5(DNS, "")).toBe("4ebd0208-8328-5d69-8c44-ec50939c0967")
    // 16 bytes del espacio + 55 o 56 del nombre: el relleno cae justo en el borde.
    expect(uuidv5(DNS, "x".repeat(55))).toBe("4c506c2a-c3a2-508b-b2ce-25c3a06bf481")
    expect(uuidv5(DNS, "x".repeat(56))).toBe("f1b9151e-183c-58b7-b276-8dafd14a10b6")
    expect(uuidv5(DNS, "x".repeat(200))).toBe("ddcc691a-b8e2-53e5-b059-6a232874b2eb")
  })
  it("el nombre va en UTF-8", () => {
    expect(uuidv5(DNS, "ñandú · Casa")).toBe("875ed00f-a66b-5975-bbef-ac387ef451c0")
  })
})
