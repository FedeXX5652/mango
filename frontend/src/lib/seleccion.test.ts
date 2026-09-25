import { describe, expect, it } from "vitest"

import { SELECCION_VACIA, alClickear, podar, todos } from "@/lib/seleccion"

const ORDEN = ["a", "b", "c", "d", "e"]

function sel(ids: string[], ancla: string | null) {
  return { ids: new Set(ids), ancla }
}

describe("click pelado", () => {
  it("deja solo ese y lo hace ancla", () => {
    const r = alClickear(sel(["a", "b"], "a"), "d", "ninguno", ORDEN)
    expect([...r.ids]).toEqual(["d"])
    expect(r.ancla).toBe("d")
  })
})

describe("toggle (Ctrl/Cmd)", () => {
  it("agrega sin tocar el resto", () => {
    const r = alClickear(sel(["a"], "a"), "c", "toggle", ORDEN)
    expect([...r.ids].sort()).toEqual(["a", "c"])
    expect(r.ancla).toBe("c")
  })

  it("saca si ya estaba", () => {
    const r = alClickear(sel(["a", "c"], "a"), "c", "toggle", ORDEN)
    expect([...r.ids]).toEqual(["a"])
  })
})

describe("rango (Shift)", () => {
  it("toma todo entre el ancla y el clickeado, inclusive", () => {
    const r = alClickear(sel(["b"], "b"), "d", "rango", ORDEN)
    expect([...r.ids]).toEqual(["b", "c", "d"])
  })

  it("funciona hacia atras", () => {
    const r = alClickear(sel(["d"], "d"), "a", "rango", ORDEN)
    expect([...r.ids]).toEqual(["a", "b", "c", "d"])
  })

  it("el ancla no se mueve: reextender mide desde el mismo lugar", () => {
    let r = alClickear(sel(["b"], "b"), "d", "rango", ORDEN)
    // Segundo Shift+click, ahora mas corto: sigue midiendo desde b, no desde d.
    r = alClickear(r, "c", "rango", ORDEN)
    expect([...r.ids]).toEqual(["b", "c"])
    expect(r.ancla).toBe("b")
  })

  it("sin ancla se comporta como click pelado", () => {
    const r = alClickear(SELECCION_VACIA, "c", "rango", ORDEN)
    expect([...r.ids]).toEqual(["c"])
    expect(r.ancla).toBe("c")
  })
})

describe("todos", () => {
  it("selecciona la lista entera", () => {
    expect([...todos(ORDEN).ids]).toEqual(ORDEN)
  })
})

describe("podar", () => {
  it("saca los ids que ya no existen", () => {
    // Se reencolaron 'b' y 'd': dejan de estar en la lista.
    const r = podar(sel(["a", "b", "d"], "d"), ["a", "c", "e"])
    expect([...r.ids]).toEqual(["a"])
    // El ancla tambien se cae si desaparecio.
    expect(r.ancla).toBeNull()
  })

  it("conserva el ancla si sigue viva", () => {
    const r = podar(sel(["a", "b"], "a"), ["a", "c"])
    expect(r.ancla).toBe("a")
  })
})
