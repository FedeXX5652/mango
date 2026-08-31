import { usePowerSync, useQuery } from "@powersync/react"
import { ChevronLeft, ChevronRight, PiggyBank, Plus, Repeat, Trash2 } from "lucide-react"
import { useMemo, useState } from "react"

import { Button } from "@/componentes/ui/button"
import { Campo } from "@/componentes/ui/campo"
import { Input } from "@/componentes/ui/input"
import { Select } from "@/componentes/ui/select"
import { ordenarJerarquico } from "@/lib/categorias"
import { aCentavos, formatearCentavos, formatearSaldo } from "@/lib/dinero"
import { type EntradaSobre, type SaldoSobre, calcularMes } from "@/lib/sobres"
import { uuidv4 } from "@/lib/uuid"
import { cn } from "@/lib/utils"

interface Cat {
  id: string
  name: string
  parent_id: string | null
  rollover: number | null
}
interface BudgetRow {
  id: string
  category_id: string
  period_start: string
  amount: number
}
interface GastoRow {
  category_id: string | null
  amount: number
  occurred_at: string
}
interface ReglaAutoRow {
  id: string
  category_id: string
  amount: number
  active: number
}

function ymDeFecha(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

export function Presupuestos() {
  const db = usePowerSync()
  const hoy = new Date()
  const [anio, setAnio] = useState(hoy.getFullYear())
  const [mes, setMes] = useState(hoy.getMonth())
  const [agregando, setAgregando] = useState(false)

  const mesKey = `${anio}-${String(mes + 1).padStart(2, "0")}`
  const periodStart = `${mesKey}-01`
  const finMesISO = new Date(anio, mes + 1, 1).toISOString()

  const { data: categorias } = useQuery<Cat>(
    "SELECT id, name, parent_id, rollover FROM categories WHERE kind='expense' AND deleted_at IS NULL AND archived = 0 ORDER BY sort_order, name",
  )
  const catById = useMemo(() => new Map(categorias.map((c) => [c.id, c])), [categorias])
  const { data: budgetRows } = useQuery<BudgetRow>(
    "SELECT id, category_id, period_start, amount FROM budgets WHERE deleted_at IS NULL",
  )
  const { data: gastoRows } = useQuery<GastoRow>(
    "SELECT category_id, amount, occurred_at FROM transactions WHERE kind='expense' AND status='confirmed' AND deleted_at IS NULL",
  )
  const { data: reglaRows } = useQuery<ReglaAutoRow>(
    "SELECT id, category_id, amount, active FROM budget_rules WHERE deleted_at IS NULL",
  )
  const reglaPorCat = useMemo(
    () => new Map(reglaRows.map((r) => [r.category_id, r])),
    [reglaRows],
  )
  const { data: fondosRows } = useQuery<{ fondos: number }>(
    `SELECT
       (SELECT COALESCE(SUM(opening_balance),0) FROM accounts WHERE COALESCE(off_budget,0)=0 AND deleted_at IS NULL)
       + COALESCE((SELECT SUM(CASE WHEN t.kind='income' THEN t.amount WHEN t.kind='expense' THEN -t.amount ELSE 0 END)
            FROM transactions t JOIN accounts a ON a.id=t.account_id
            WHERE COALESCE(a.off_budget,0)=0 AND a.deleted_at IS NULL AND t.status='confirmed' AND t.deleted_at IS NULL AND t.occurred_at < ?),0)
       + COALESCE((SELECT SUM(t.amount) FROM transactions t JOIN accounts a ON a.id=t.transfer_account_id
            WHERE COALESCE(a.off_budget,0)=0 AND a.deleted_at IS NULL AND t.kind='transfer' AND t.status='confirmed' AND t.deleted_at IS NULL AND t.occurred_at < ?),0)
       - COALESCE((SELECT SUM(t.amount) FROM transactions t JOIN accounts a ON a.id=t.account_id
            WHERE COALESCE(a.off_budget,0)=0 AND a.deleted_at IS NULL AND t.kind='transfer' AND t.status='confirmed' AND t.deleted_at IS NULL AND t.occurred_at < ?),0)
       AS fondos`,
    [finMesISO, finMesISO, finMesISO],
  )
  const fondos = fondosRows[0]?.fondos ?? 0

  // Un sobre = una categoria que se agrego (tiene alguna fila de budgets).
  const sobreIds = useMemo(() => new Set(budgetRows.map((b) => b.category_id)), [budgetRows])

  const asignado = useMemo(() => {
    const m = new Map<string, number>()
    for (const b of budgetRows) m.set(`${b.category_id}|${b.period_start.slice(0, 7)}`, b.amount)
    return m
  }, [budgetRows])
  const budgetIdPorClave = useMemo(() => {
    const m = new Map<string, string>()
    for (const b of budgetRows) m.set(`${b.category_id}|${b.period_start.slice(0, 7)}`, b.id)
    return m
  }, [budgetRows])
  const gastado = useMemo(() => {
    const m = new Map<string, number>()
    for (const g of gastoRows) {
      if (!g.category_id) continue
      const k = `${g.category_id}|${ymDeFecha(g.occurred_at)}`
      m.set(k, (m.get(k) ?? 0) + g.amount)
    }
    return m
  }, [gastoRows])

  const meses = useMemo(() => {
    const set = new Set<string>([mesKey])
    for (const b of budgetRows) set.add(b.period_start.slice(0, 7))
    for (const g of gastoRows) if (g.category_id) set.add(ymDeFecha(g.occurred_at))
    const ord = [...set].filter((m) => m <= mesKey).sort()
    return ord.length ? ord : [mesKey]
  }, [budgetRows, gastoRows, mesKey])

  const sobreCats = useMemo(
    () => categorias.filter((c) => sobreIds.has(c.id)),
    [categorias, sobreIds],
  )
  const resultado = useMemo(() => {
    const sobres: EntradaSobre[] = sobreCats.map((c) => ({
      categoryId: c.id,
      rollover: c.rollover === 1,
    }))
    return calcularMes({ sobres, asignado, gastado, fondos, meses })
  }, [sobreCats, asignado, gastado, fondos, meses])
  const saldoPorId = useMemo(
    () => new Map(resultado.sobres.map((s) => [s.categoryId, s])),
    [resultado],
  )

  const totalAsignado = resultado.sobres.reduce((s, e) => s + e.assigned, 0)
  const totalGastado = resultado.sobres.reduce((s, e) => s + e.spent, 0)
  const totalDisponible = resultado.sobres.reduce((s, e) => s + e.balance, 0)
  const pctGastado = totalAsignado > 0 ? Math.min((totalGastado / totalAsignado) * 100, 100) : 0
  const excedido = totalGastado > totalAsignado

  function asignadoSel(catId: string): number {
    return asignado.get(`${catId}|${mesKey}`) ?? 0
  }
  async function asignar(catId: string, centavos: number) {
    const clave = `${catId}|${mesKey}`
    const existente = budgetIdPorClave.get(clave)
    if (existente) {
      await db.execute("UPDATE budgets SET amount = ? WHERE id = ?", [centavos, existente])
    } else {
      await db.execute(
        "INSERT INTO budgets (id, category_id, period_start, amount, currency) VALUES (?, ?, ?, ?, 'ARS')",
        [uuidv4(), catId, periodStart, centavos],
      )
    }
    // Si el sobre tiene asignacion automatica, la regla sigue al monto asignado.
    const regla = reglaPorCat.get(catId)
    if (regla?.active) {
      await db.execute("UPDATE budget_rules SET amount = ? WHERE id = ?", [centavos, regla.id])
    }
  }
  async function quitarSobre(catId: string) {
    await db.execute("DELETE FROM budgets WHERE category_id = ?", [catId])
    await db.execute("DELETE FROM budget_rules WHERE category_id = ?", [catId])
  }
  async function toggleAhorro(catId: string, rollover: boolean) {
    await db.execute("UPDATE categories SET rollover = ? WHERE id = ?", [rollover ? 1 : 0, catId])
  }
  // Asignacion automatica cada mes = una budget_rule con el monto del sobre.
  async function toggleAuto(catId: string, on: boolean) {
    const regla = reglaPorCat.get(catId)
    if (on) {
      const monto = asignadoSel(catId)
      if (regla) {
        await db.execute("UPDATE budget_rules SET amount = ?, active = 1 WHERE id = ?", [
          monto,
          regla.id,
        ])
      } else {
        await db.execute(
          "INSERT INTO budget_rules (id, category_id, amount, currency, active) VALUES (?, ?, ?, 'ARS', 1)",
          [uuidv4(), catId, monto],
        )
      }
    } else if (regla) {
      await db.execute("DELETE FROM budget_rules WHERE id = ?", [regla.id])
    }
  }

  function cambiarMes(delta: number) {
    const d = new Date(anio, mes + delta, 1)
    setAnio(d.getFullYear())
    setMes(d.getMonth())
  }
  const etiquetaMes = new Date(anio, mes, 1).toLocaleDateString("es-AR", {
    month: "long",
    year: "numeric",
  })

  // Agrupacion: padre es hoja y grupo. Raiz = parent_id ?? id.
  const raices = useMemo(() => {
    const m = new Map<string, Cat[]>()
    for (const s of sobreCats) {
      const root = s.parent_id ?? s.id
      if (!m.has(root)) m.set(root, [])
      m.get(root)!.push(s)
    }
    return [...m.entries()]
  }, [sobreCats])

  const noSobres = ordenarJerarquico(
    categorias,
    new Set(categorias.filter((c) => !sobreIds.has(c.id)).map((c) => c.id)),
  )

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <div className="rounded-xl bg-card p-5">
        <p className="text-sm font-medium text-muted-foreground">Por asignar</p>
        <p
          className={cn(
            "tabular text-3xl font-semibold",
            resultado.porAsignar < 0 && "text-expense",
          )}
        >
          {formatearSaldo(resultado.porAsignar)}
        </p>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
          <div
            className={cn("h-full rounded-full", excedido ? "bg-expense" : "bg-primary")}
            style={{ width: `${pctGastado}%` }}
          />
        </div>
        <div className="mt-2 flex justify-between text-xs text-muted-foreground">
          <span>Asignado $ {formatearCentavos(totalAsignado)}</span>
          <span>Gastado $ {formatearCentavos(totalGastado)}</span>
          <span className={cn(totalDisponible < 0 && "text-expense")}>
            Disponible {formatearSaldo(totalDisponible)}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-center gap-1">
        <Button variant="ghost" size="icon" onClick={() => cambiarMes(-1)} aria-label="Mes anterior">
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <span className="min-w-40 text-center text-sm font-medium capitalize">{etiquetaMes}</span>
        <Button variant="ghost" size="icon" onClick={() => cambiarMes(1)} aria-label="Mes siguiente">
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>

      {agregando ? (
        <FormAgregar
          candidatas={noSobres}
          catById={catById}
          onCerrar={() => setAgregando(false)}
          onAgregar={async (catId, ahorro, centavos) => {
            if (ahorro) await toggleAhorro(catId, true)
            await asignar(catId, centavos)
            setAgregando(false)
          }}
        />
      ) : (
        <Button
          variant="outline"
          className="w-full"
          onClick={() => setAgregando(true)}
          disabled={noSobres.length === 0}
        >
          <Plus className="h-4 w-4" /> Agregar sobre
        </Button>
      )}

      {sobreCats.length === 0 ? (
        <p className="p-8 text-center text-sm text-muted-foreground">
          Todavía no agregaste ningún sobre.
        </p>
      ) : (
        <div className="space-y-4">
          {raices.map(([rootId, miembros]) => {
            const rootCat = catById.get(rootId)
            const hijos = miembros.filter((m) => m.parent_id === rootId)
            const rootEsSobre = miembros.some((m) => m.id === rootId)
            if (hijos.length === 0 && rootEsSobre && rootCat) {
              return (
                <FilaSobre
                  key={rootId}
                  cat={rootCat}
                  saldo={saldoPorId.get(rootId)}
                  asignadoSel={asignadoSel(rootId)}
                  autoOn={reglaPorCat.get(rootId)?.active === 1}
                  onAsignar={asignar}
                  onQuitar={quitarSobre}
                  onAhorro={toggleAhorro}
                  onToggleAuto={toggleAuto}
                />
              )
            }
            const asigTot = miembros.reduce((s, m) => s + (saldoPorId.get(m.id)?.assigned ?? 0), 0)
            const gastTot = miembros.reduce((s, m) => s + (saldoPorId.get(m.id)?.spent ?? 0), 0)
            return (
              <div key={rootId} className="space-y-1">
                <div className="flex items-center justify-between px-1 text-sm font-semibold">
                  <span>{rootCat?.name ?? "—"}</span>
                  <span className="tabular text-xs text-muted-foreground">
                    $ {formatearCentavos(asigTot)} · $ {formatearCentavos(gastTot)} gast.
                  </span>
                </div>
                {rootEsSobre && rootCat && (
                  <FilaSobre
                    cat={rootCat}
                    nombre={`${rootCat.name} (directo)`}
                    saldo={saldoPorId.get(rootId)}
                    asignadoSel={asignadoSel(rootId)}
                    autoOn={reglaPorCat.get(rootId)?.active === 1}
                    onAsignar={asignar}
                    onQuitar={quitarSobre}
                    onAhorro={toggleAhorro}
                    onToggleAuto={toggleAuto}
                  />
                )}
                {hijos.map((h) => (
                  <FilaSobre
                    key={h.id}
                    cat={h}
                    sangria
                    saldo={saldoPorId.get(h.id)}
                    asignadoSel={asignadoSel(h.id)}
                    autoOn={reglaPorCat.get(h.id)?.active === 1}
                    onAsignar={asignar}
                    onQuitar={quitarSobre}
                    onAhorro={toggleAhorro}
                    onToggleAuto={toggleAuto}
                  />
                ))}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function FilaSobre({
  cat,
  nombre,
  saldo,
  asignadoSel,
  autoOn,
  sangria,
  onAsignar,
  onQuitar,
  onAhorro,
  onToggleAuto,
}: {
  cat: Cat
  nombre?: string
  saldo: SaldoSobre | undefined
  asignadoSel: number
  autoOn: boolean
  sangria?: boolean
  onAsignar: (catId: string, centavos: number) => void
  onQuitar: (catId: string) => void
  onAhorro: (catId: string, rollover: boolean) => void
  onToggleAuto: (catId: string, on: boolean) => void
}) {
  const [texto, setTexto] = useState((asignadoSel / 100).toString().replace(".", ","))
  const [abierto, setAbierto] = useState(false)
  const balance = saldo?.balance ?? 0
  const gastado = saldo?.spent ?? 0
  const pct = asignadoSel > 0 ? Math.min((gastado / asignadoSel) * 100, 100) : 0
  const excedido = gastado > asignadoSel

  return (
    <div className={cn("rounded-lg border border-border bg-card p-3", sangria && "ml-4")}>
      <button
        className="flex w-full items-center gap-1 text-left"
        onClick={() => setAbierto((a) => !a)}
      >
        <span className="truncate font-medium">{nombre ?? cat.name}</span>
        {cat.rollover === 1 && <PiggyBank className="h-3.5 w-3.5 shrink-0 text-income" />}
        {autoOn && <Repeat className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
      </button>

      <div className="mt-2 grid grid-cols-3 items-end gap-2">
        <div>
          <p className="mb-0.5 text-xs text-muted-foreground">Asignado</p>
          <Input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onBlur={() => onAsignar(cat.id, Math.max(0, aCentavos(texto) ?? 0))}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            inputMode="decimal"
            className="h-8 tabular text-right"
            aria-label="Asignado"
          />
        </div>
        <div className="text-right">
          <p className="mb-0.5 text-xs text-muted-foreground">Gastado</p>
          <p className="tabular h-8 leading-8">$ {formatearCentavos(gastado)}</p>
        </div>
        <div className="text-right">
          <p className="mb-0.5 text-xs text-muted-foreground">Disponible</p>
          <p
            className={cn(
              "tabular h-8 font-medium leading-8",
              balance < 0 ? "text-expense" : "text-income",
            )}
          >
            {formatearSaldo(balance)}
          </p>
        </div>
      </div>

      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full", excedido ? "bg-expense" : "bg-primary")}
          style={{ width: `${pct}%` }}
        />
      </div>

      {abierto && (
        <div className="mt-2 space-y-2 border-t border-border pt-2 text-sm">
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={cat.rollover === 1}
                onChange={(e) => onAhorro(cat.id, e.target.checked)}
              />
              Ahorro (acumula)
            </label>
            <Button
              variant="ghost"
              size="sm"
              className="text-expense"
              onClick={() => onQuitar(cat.id)}
            >
              <Trash2 className="h-4 w-4" /> Quitar
            </Button>
          </div>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={autoOn}
              onChange={(e) => onToggleAuto(cat.id, e.target.checked)}
            />
            Asignar automáticamente cada mes
          </label>
          {autoOn && (
            <p className="pl-6 text-xs text-muted-foreground">
              Cada mes se asigna solo el monto de arriba (editalo y la regla se actualiza).
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function FormAgregar({
  candidatas,
  catById,
  onCerrar,
  onAgregar,
}: {
  candidatas: Cat[]
  catById: Map<string, Cat>
  onCerrar: () => void
  onAgregar: (catId: string, ahorro: boolean, centavos: number) => void
}) {
  const [catId, setCatId] = useState("")
  const [ahorro, setAhorro] = useState(false)
  const [monto, setMonto] = useState("")
  const [error, setError] = useState("")

  function etiqueta(c: Cat): string {
    return c.parent_id ? `${catById.get(c.parent_id)?.name ?? "—"} › ${c.name}` : c.name
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-4">
      <Campo etiqueta="Categoría">
        <Select value={catId} onChange={(e) => setCatId(e.target.value)}>
          <option value="">Elegí una categoría</option>
          {candidatas.map((c) => (
            <option key={c.id} value={c.id}>
              {etiqueta(c)}
            </option>
          ))}
        </Select>
      </Campo>
      <Campo etiqueta="Asignación de este mes (opcional)">
        <Input value={monto} onChange={(e) => setMonto(e.target.value)} inputMode="decimal" placeholder="0" />
      </Campo>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={ahorro} onChange={(e) => setAhorro(e.target.checked)} />
        Sobre de ahorro (el saldo acumula mes a mes)
      </label>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button
          className="flex-1"
          onClick={() => {
            if (!catId) return setError("Elegí una categoría")
            onAgregar(catId, ahorro, Math.max(0, aCentavos(monto) ?? 0))
          }}
        >
          Agregar
        </Button>
        <Button variant="outline" onClick={onCerrar}>
          Cancelar
        </Button>
      </div>
    </div>
  )
}
