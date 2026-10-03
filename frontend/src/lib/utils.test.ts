import { describe, expect, it } from "vitest"

import { cn } from "@/lib/utils"

describe("cn", () => {
  it("un tamaño de letra propio convive con un color de texto", () => {
    expect(cn("text-barra", "text-muted-foreground")).toBe("text-barra text-muted-foreground")
    expect(cn("text-celda", "text-income")).toBe("text-celda text-income")
  })
  it("dos tamaños: gana el ultimo, como con los de Tailwind", () => {
    expect(cn("text-sm", "text-barra")).toBe("text-barra")
    expect(cn("text-destacado", "text-2xl")).toBe("text-2xl")
  })
})
