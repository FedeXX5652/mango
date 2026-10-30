import { describe, expect, it } from "vitest"

import { type Plan, planCategoria, planCuenta } from "@/lib/reasignar"

// Lo que se prueba es la COBERTURA del plan: el error facil es olvidarse una
// tabla que referencia la entidad, y entonces queda una fila apuntando a algo
// borrado. Cada prueba lista las tablas que deben aparecer.
function tablas(plan: Plan): string[] {
  return plan.sentencias.map((s) => {
    const m = s.sql.match(/^(?:UPDATE|DELETE FROM) (\w+)/)
    if (!m) throw new Error(`sentencia sin tabla: ${s.sql}`)
    return m[1]
  })
}

function ultima(plan: Plan) {
  return plan.sentencias[plan.sentencias.length - 1]
}

describe("planCategoria", () => {
  const plan = planCategoria("vieja", "nueva")

  it("cubre todo lo que referencia una categoria", () => {
    // Las mismas tablas que chequea el "en uso" de la pantalla, mas categories
    // por las subcategorias. `category_rules` no entra: no se sincroniza.
    expect(new Set(tablas(plan))).toEqual(
      new Set([
        "transactions",
        "templates",
        "recurring_rules",
        "categories",
        "budgets",
        "budget_rules",
      ]),
    )
  })

  it("mueve los movimientos al destino", () => {
    const s = plan.sentencias.find((x) => x.sql.startsWith("UPDATE transactions"))
    expect(s?.params).toEqual(["nueva", "vieja"])
  })

  it("una subcategoria no puede quedar como su propio padre", () => {
    const s = plan.sentencias.find((x) => x.sql.includes("SET parent_id = ? WHERE parent_id"))
    // El destino se excluye del reparentado...
    expect(s?.sql).toContain("id <> ?")
    expect(s?.params).toEqual(["nueva", "vieja", "nueva"])
    // ...y si era hija de la que se elimina, queda como raiz.
    expect(plan.sentencias.some((x) => x.sql.includes("SET parent_id = NULL"))).toBe(true)
  })

  it("el presupuesto se elimina, no se suma, y se avisa", () => {
    expect(plan.sentencias.some((x) => x.sql === "DELETE FROM budgets WHERE category_id = ?")).toBe(
      true,
    )
    expect(plan.advertencias.length).toBeGreaterThan(0)
  })

  it("termina borrando la categoria", () => {
    expect(ultima(plan)).toEqual({
      sql: "DELETE FROM categories WHERE id = ?",
      params: ["vieja"],
    })
  })
})

describe("planCuenta", () => {
  const plan = planCuenta("vieja", "nueva")

  it("cubre todo lo que referencia una cuenta, incluidas las dos puntas de una transferencia", () => {
    expect(new Set(tablas(plan))).toEqual(
      new Set(["transactions", "templates", "recurring_rules", "accounts"]),
    )
    const puntas = plan.sentencias.filter((x) => x.sql.startsWith("UPDATE transactions"))
    expect(puntas.map((p) => p.sql.includes("transfer_account_id"))).toEqual([false, true])
  })

  it("termina borrando la cuenta", () => {
    expect(ultima(plan).sql).toBe("DELETE FROM accounts WHERE id = ?")
  })
})

describe("los planes", () => {
  it("nunca dejan la entidad sin borrar y siempre la borran al final", () => {
    for (const plan of [planCategoria("a", "b"), planCuenta("a", "b")]) {
      const borrados = plan.sentencias.filter((s) => s.sql.startsWith("DELETE FROM"))
      expect(borrados.length).toBeGreaterThan(0)
      expect(ultima(plan).params).toEqual(["a"])
    }
  })

  it("ninguna sentencia apunta el destino contra si mismo", () => {
    for (const plan of [planCategoria("a", "b"), planCuenta("a", "b")]) {
      for (const s of plan.sentencias) {
        // El origen ("a") tiene que estar en toda sentencia: es lo que se busca.
        expect(s.params).toContain("a")
      }
    }
  })
})
