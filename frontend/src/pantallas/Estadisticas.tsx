import { useQuery } from "@powersync/react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { useMemo, useState } from "react"
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { Button } from "@/componentes/ui/button"
import { useColoresTokens } from "@/hooks/useColoresTokens"
import { formatearCentavos, formatearMonto } from "@/lib/dinero"

interface CatRow {
  id: string
  name: string
  parent_id: string | null
}
interface GastoRow {
  category_id: string | null
  total: number
}
interface EvoRow {
  kind: "income" | "expense"
  amount: number
  occurred_at: string
}

// Nota: en fase 1 (una sola moneda) se agregan todos los montos juntos. Con
// multimoneda (fase 4) habra que convertir a la moneda base.
const PALETA = [
  "#FDBE02", "#0F766E", "#4F46E5", "#C62828", "#00795B",
  "#1F5FBF", "#6D45C7", "#D97706", "#0891B2", "#DB2777",
]

export function Estadisticas() {
  const colores = useColoresTokens()
  const hoy = new Date()
  const [anio, setAnio] = useState(hoy.getFullYear())
  const [mes, setMes] = useState(hoy.getMonth())

  const { data: categorias } = useQuery<CatRow>(
    "SELECT id, name, parent_id FROM categories WHERE deleted_at IS NULL",
  )
  const catById = useMemo(() => new Map(categorias.map((c) => [c.id, c])), [categorias])

  const inicioMes = new Date(anio, mes, 1).toISOString()
  const finMes = new Date(anio, mes + 1, 1).toISOString()
  const { data: gastoRows } = useQuery<GastoRow>(
    `SELECT category_id, SUM(amount) AS total FROM transactions
     WHERE kind='expense' AND status='confirmed' AND deleted_at IS NULL
       AND occurred_at >= ? AND occurred_at < ?
     GROUP BY category_id`,
    [inicioMes, finMes],
  )

  // Torta: gasto por categoria principal (las subcategorias suman al padre).
  const torta = useMemo(() => {
    const acc = new Map<string, { name: string; value: number }>()
    for (const r of gastoRows) {
      const cat = r.category_id ? catById.get(r.category_id) : undefined
      const padre = cat?.parent_id ? catById.get(cat.parent_id) : cat
      const key = padre?.id ?? "sin"
      const name = padre?.name ?? "Sin categoría"
      const cur = acc.get(key) ?? { name, value: 0 }
      cur.value += r.total
      acc.set(key, cur)
    }
    return [...acc.values()].sort((a, b) => b.value - a.value)
  }, [gastoRows, catById])

  const totalMes = torta.reduce((s, t) => s + t.value, 0)

  // Evolucion: ultimos 6 meses.
  const inicioEvo = new Date(hoy.getFullYear(), hoy.getMonth() - 5, 1).toISOString()
  const { data: evoRows } = useQuery<EvoRow>(
    `SELECT kind, amount, occurred_at FROM transactions
     WHERE kind IN ('income','expense') AND status='confirmed' AND deleted_at IS NULL
       AND occurred_at >= ?`,
    [inicioEvo],
  )
  const evolucion = useMemo(() => {
    const meses = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(hoy.getFullYear(), hoy.getMonth() - (5 - i), 1)
      return {
        clave: `${d.getFullYear()}-${d.getMonth()}`,
        etiqueta: d.toLocaleDateString("es-AR", { month: "short" }),
        ingresos: 0,
        gastos: 0,
      }
    })
    const idx = new Map(meses.map((m, i) => [m.clave, i]))
    for (const r of evoRows) {
      const d = new Date(r.occurred_at)
      const i = idx.get(`${d.getFullYear()}-${d.getMonth()}`)
      if (i === undefined) continue
      if (r.kind === "income") meses[i].ingresos += r.amount
      else meses[i].gastos += r.amount
    }
    return meses.map((m) => ({ ...m, neto: m.ingresos - m.gastos }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evoRows])

  const etiquetaMes = new Date(anio, mes, 1).toLocaleDateString("es-AR", {
    month: "long",
    year: "numeric",
  })
  const ejeY = (v: number) => `$${Math.round(v / 100).toLocaleString("es-AR")}`
  const tip = (v: number) => formatearMonto(v)

  function cambiarMes(delta: number) {
    const d = new Date(anio, mes + delta, 1)
    setAnio(d.getFullYear())
    setMes(d.getMonth())
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8 p-4">
      <h1 className="text-2xl font-semibold">Estadísticas</h1>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-muted-foreground">Gasto por categoría</h2>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => cambiarMes(-1)}
              aria-label="Mes anterior"
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <span className="min-w-32 text-center text-sm capitalize">{etiquetaMes}</span>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => cambiarMes(1)}
              aria-label="Mes siguiente"
            >
              <ChevronRight className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {torta.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">Sin gastos este mes.</p>
        ) : (
          <>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={torta}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={55}
                    outerRadius={90}
                  >
                    {torta.map((_, i) => (
                      <Cell key={i} fill={PALETA[i % PALETA.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => tip(Number(v))} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="space-y-1">
              {torta.map((t, i) => (
                <li key={t.name} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: PALETA[i % PALETA.length] }}
                    />
                    {t.name}
                  </span>
                  <span className="tabular">
                    $ {formatearCentavos(t.value)}
                    <span className="ml-2 text-xs text-muted-foreground">
                      {Math.round((t.value / totalMes) * 100)}%
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground">Evolución (6 meses)</h2>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={evolucion}>
              <CartesianGrid strokeDasharray="3 3" stroke={colores.border} />
              <XAxis dataKey="etiqueta" tick={{ fontSize: 12, fill: colores["muted-foreground"] }} />
              <YAxis
                width={70}
                tickFormatter={ejeY}
                tick={{ fontSize: 11, fill: colores["muted-foreground"] }}
              />
              <Tooltip formatter={(v) => tip(Number(v))} />
              <Legend />
              <Bar dataKey="ingresos" name="Ingresos" fill={colores.income} radius={[3, 3, 0, 0]} />
              <Bar dataKey="gastos" name="Gastos" fill={colores.expense} radius={[3, 3, 0, 0]} />
              <Line
                dataKey="neto"
                name="Neto"
                stroke={colores.foreground}
                strokeWidth={2}
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  )
}
