// Los tipos de una plantilla, como se nombran en pantalla.
export const TIPOS_PLANTILLA: { valor: string; etiqueta: string }[] = [
  { valor: "expense", etiqueta: "Gasto" },
  { valor: "income", etiqueta: "Ingreso" },
  { valor: "transfer", etiqueta: "Transferencia" },
]

// La cuenta que se propone al cargar una plantilla del grupo (1.12.2).
//
// Una plantilla del grupo no lleva cuenta: cada uno paga con la suya (T1). Para
// que cargarla sea tan directo como una personal, se propone la ultima cuenta
// propia con la que se pago esa categoria en el grupo; si nunca se pago, la
// ultima usada en el grupo. Cada miembro ve la suya.

export interface MovimientoPropio {
  category_id: string | null
  account_id: string
  account_name: string
}

// Los gastos propios del grupo, del mas nuevo al mas viejo. Solo cuentas
// personales vigentes: la conjunta tiene su linea en "¿Quién pagó?", y las de
// otro miembro no llegan a este telefono.
export const SQL_MIS_CUENTAS_EN_GRUPO = `SELECT t.category_id, t.account_id, a.name AS account_name
  FROM transactions t JOIN accounts a ON a.id = t.account_id
  WHERE t.group_id = ? AND t.kind = 'expense' AND t.deleted_at IS NULL
    AND a.group_id IS NULL AND a.parent_account_id IS NULL
    AND a.deleted_at IS NULL AND a.archived = 0
  ORDER BY t.occurred_at DESC LIMIT 200`

export interface CuentaPropuesta {
  cuenta: string
  nombre: string
  // Por que esa: para decirlo al cargarla.
  motivo: "categoria" | "grupo"
}

export function cuentaParaPlantilla(
  historial: MovimientoPropio[],
  categoriaId: string | null,
): CuentaPropuesta | null {
  const deLaCategoria = categoriaId
    ? historial.find((m) => m.category_id === categoriaId)
    : undefined
  const m = deLaCategoria ?? historial[0]
  if (!m) return null
  return {
    cuenta: m.account_id,
    nombre: m.account_name,
    motivo: deLaCategoria ? "categoria" : "grupo",
  }
}

export function textoCuentaPropuesta(p: CuentaPropuesta): string {
  return p.motivo === "categoria"
    ? `Cuenta: ${p.nombre}, la última con la que pagaste esta categoría en el grupo.`
    : `Cuenta: ${p.nombre}, la última que usaste en el grupo.`
}
