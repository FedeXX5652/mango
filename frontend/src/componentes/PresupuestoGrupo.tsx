import { usePowerSync, useQuery } from "@powersync/react"
import { useMemo, useState } from "react"

import { Button } from "@/componentes/ui/button"
import { Input } from "@/componentes/ui/input"
import { FilaInset, ListaInset } from "@/componentes/ui/listaInset"
import { aCentavos, formatearMonto } from "@/lib/dinero"
import { iconoDe } from "@/lib/iconos"
import { uuidv4 } from "@/lib/uuid"
import { cn } from "@/lib/utils"

// Presupuesto del grupo (fase 3b.3, ver 0015): un tope mensual por categoria del
// grupo, contra lo que el grupo gasto ese mes en esa categoria. Cualquier miembro
// lo pone/edita (0014). Se escribe local (budgets con group_id) y sube por /budgets.

interface CatRow {
  id: string
  name: string
  icon: string | null
}

function primerDiaMesISO(): string {
  const h = new Date()
  // Fecha (no datetime): el sobre es del mes. YYYY-MM-01.
  return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, "0")}-01`
}

export function PresupuestoGrupo({ groupId }: { groupId: string }) {
  const db = usePowerSync()
  const mes = primerDiaMesISO()

  const { data: grupoRows } = useQuery<{ base_currency: string }>(
    "SELECT base_currency FROM groups WHERE id = ?",
    [groupId],
  )
  const moneda = grupoRows[0]?.base_currency ?? "ARS"

  // Categorias de gasto del grupo (donde tiene sentido un tope).
  const { data: cats } = useQuery<CatRow>(
    "SELECT id, name, icon FROM categories WHERE group_id = ? AND kind = 'expense' AND archived = 0 AND deleted_at IS NULL ORDER BY sort_order, name",
    [groupId],
  )
  // Presupuestos del grupo de este mes.
  const { data: budgets } = useQuery<{ id: string; category_id: string; amount: number }>(
    "SELECT id, category_id, amount FROM budgets WHERE group_id = ? AND period_start = ? AND deleted_at IS NULL",
    [groupId, mes],
  )
  // Gastado por categoria este mes (gastos compartidos del grupo).
  const { data: gastado } = useQuery<{ category_id: string; total: number }>(
    `SELECT category_id, SUM(amount) AS total FROM transactions
     WHERE group_id = ? AND visibility = 'shared' AND kind = 'expense' AND deleted_at IS NULL
       AND occurred_at >= ? AND occurred_at < ?
     GROUP BY category_id`,
    [groupId, `${mes.slice(0, 7)}-01T00:00:00.000`, finDeMes(mes)],
  )

  const budgetDe = useMemo(
    () => new Map(budgets.map((b) => [b.category_id, b])),
    [budgets],
  )
  const gastadoDe = useMemo(
    () => new Map(gastado.map((g) => [g.category_id, g.total])),
    [gastado],
  )

  // Solo las categorias con tope o con gasto: no abruma con las 20 vacias.
  const filas = cats.filter((c) => budgetDe.has(c.id) || (gastadoDe.get(c.id) ?? 0) > 0)
  const [editando, setEditando] = useState<string | null>(null)

  async function guardar(categoryId: string, texto: string) {
    const centavos = aCentavos(texto, moneda) ?? 0
    const existente = budgetDe.get(categoryId)
    if (existente) {
      if (centavos <= 0) await db.execute("DELETE FROM budgets WHERE id = ?", [existente.id])
      else await db.execute("UPDATE budgets SET amount = ? WHERE id = ?", [centavos, existente.id])
    } else if (centavos > 0) {
      await db.execute(
        "INSERT INTO budgets (id, group_id, category_id, period_start, amount, currency) VALUES (?, ?, ?, ?, ?, ?)",
        [uuidv4(), groupId, categoryId, mes, centavos, moneda],
      )
    }
    setEditando(null)
  }

  const totalTope = budgets.reduce((s, b) => s + b.amount, 0)

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground">Presupuesto del mes</h2>
        {totalTope > 0 && (
          <span className="tabular text-xs text-muted-foreground">
            tope {formatearMonto(totalTope, { moneda })}
          </span>
        )}
      </div>

      {cats.length === 0 ? null : (
        <ListaInset>
          {(filas.length > 0 ? filas : cats).map((c) => {
            const b = budgetDe.get(c.id)
            const usado = gastadoDe.get(c.id) ?? 0
            const tope = b?.amount ?? 0
            const pct = tope > 0 ? Math.min(100, Math.round((usado / tope) * 100)) : 0
            const excedido = tope > 0 && usado > tope
            const Icono = iconoDe(c.icon)
            return (
              <FilaInset key={c.id}>
                <span className="flex min-w-0 flex-1 items-center gap-2.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                    <Icono className="h-4 w-4 text-muted-foreground" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate">{c.name}</span>
                      {editando === c.id ? (
                        <ToqueMonto
                          inicial={tope ? (tope / 100).toString().replace(".", ",") : ""}
                          onGuardar={(v) => guardar(c.id, v)}
                          onCancelar={() => setEditando(null)}
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => setEditando(c.id)}
                          className="tabular shrink-0 text-xs text-muted-foreground hover:text-foreground"
                        >
                          {formatearMonto(usado, { moneda })}
                          {tope > 0 ? ` / ${formatearMonto(tope, { moneda })}` : " · poner tope"}
                        </button>
                      )}
                    </span>
                    {tope > 0 && (
                      <span className="mt-1 block h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <span
                          className={cn("block h-full rounded-full", excedido ? "bg-expense" : "bg-primary")}
                          style={{ width: `${pct}%` }}
                        />
                      </span>
                    )}
                  </span>
                </span>
              </FilaInset>
            )
          })}
        </ListaInset>
      )}
    </section>
  )
}

function finDeMes(primerDia: string): string {
  const [y, m] = primerDia.split("-").map(Number)
  const finY = m === 12 ? y + 1 : y
  const finM = m === 12 ? 1 : m + 1
  return `${finY}-${String(finM).padStart(2, "0")}-01T00:00:00.000`
}

function ToqueMonto({
  inicial,
  onGuardar,
  onCancelar,
}: {
  inicial: string
  onGuardar: (v: string) => void
  onCancelar: () => void
}) {
  const [v, setV] = useState(inicial)
  return (
    <span className="flex shrink-0 items-center gap-1">
      <Input
        value={v}
        onChange={(e) => setV(e.target.value)}
        inputMode="decimal"
        autoFocus
        placeholder="0"
        className="tabular h-7 w-20 text-right"
        onKeyDown={(e) => {
          if (e.key === "Enter") onGuardar(v)
          if (e.key === "Escape") onCancelar()
        }}
      />
      <Button size="sm" className="h-7 px-2" onClick={() => onGuardar(v)}>
        OK
      </Button>
    </span>
  )
}
