import { useQuery } from "@powersync/react"
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight } from "lucide-react"
import { useMemo, useState } from "react"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from "recharts"

import { Button } from "@/componentes/ui/button"
import { Hoja } from "@/componentes/ui/hoja"
import { useColoresTokens } from "@/hooks/useColoresTokens"
import { formatearCentavos, formatearMonto, formatearSaldo } from "@/lib/dinero"
import { mesAnio } from "@/lib/fecha"
import { cn } from "@/lib/utils"

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

// La leyenda muestra las mas representativas; el resto va en un dialogo.
const MAX_CATEGORIAS = 5

// Variacion contra el periodo anterior. En un gasto, subir es malo: flecha
// arriba + token expense. Nunca se comunica solo por color (va la flecha y el
// signo). `null` = no habia gasto previo en esa categoria.
function Variacion({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-xs text-muted-foreground">nuevo</span>
  const redondeado = Math.round(pct)
  if (redondeado === 0) return <span className="text-xs text-muted-foreground">sin cambio</span>
  const sube = redondeado > 0
  const Icono = sube ? ArrowUp : ArrowDown
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-xs font-medium",
        sube ? "text-expense" : "text-income",
      )}
    >
      <Icono className="h-3 w-3" aria-hidden />
      {sube ? "+" : "−"}
      {Math.abs(redondeado)}%
    </span>
  )
}

// Barra de progreso comparativa (ingresos vs egresos del mes).
function BarraMes({
  etiqueta,
  valor,
  tope,
  barra,
  texto,
}: {
  etiqueta: string
  valor: number
  tope: number
  barra: string
  texto: string
}) {
  const pct = Math.min((valor / tope) * 100, 100)
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{etiqueta}</span>
        <span className={cn("tabular font-semibold", texto)}>$ {formatearCentavos(valor)}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full", barra)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

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

  // Totales del mes elegido, para las barras de ingresos vs egresos.
  const { data: totalesMes } = useQuery<{ kind: string; total: number }>(
    `SELECT kind, SUM(amount) AS total FROM transactions
     WHERE kind IN ('income','expense') AND status='confirmed' AND deleted_at IS NULL
       AND occurred_at >= ? AND occurred_at < ?
     GROUP BY kind`,
    [inicioMes, finMes],
  )
  const ingresosMes = totalesMes.find((r) => r.kind === "income")?.total ?? 0
  const egresosMes = totalesMes.find((r) => r.kind === "expense")?.total ?? 0
  const resultadoMes = ingresosMes - egresosMes
  const topeMes = Math.max(ingresosMes, egresosMes, 1)

  // Mismo corte para el mes anterior, para poder comparar.
  const inicioMesAnterior = new Date(anio, mes - 1, 1).toISOString()
  const { data: gastoAnteriorRows } = useQuery<GastoRow>(
    `SELECT category_id, SUM(amount) AS total FROM transactions
     WHERE kind='expense' AND status='confirmed' AND deleted_at IS NULL
       AND occurred_at >= ? AND occurred_at < ?
     GROUP BY category_id`,
    [inicioMesAnterior, inicioMes],
  )

  // Gasto por categoria principal (las subcategorias suman al padre), ordenado
  // de mayor a menor y con la variacion contra el mes anterior.
  const torta = useMemo(() => {
    const agrupar = (rows: GastoRow[]) => {
      const acc = new Map<string, { name: string; value: number }>()
      for (const r of rows) {
        const cat = r.category_id ? catById.get(r.category_id) : undefined
        const padre = cat?.parent_id ? catById.get(cat.parent_id) : cat
        const key = padre?.id ?? "sin"
        const name = padre?.name ?? "Sin categoría"
        const cur = acc.get(key) ?? { name, value: 0 }
        cur.value += r.total
        acc.set(key, cur)
      }
      return acc
    }
    const actual = agrupar(gastoRows)
    const anterior = agrupar(gastoAnteriorRows)
    return [...actual.entries()]
      .map(([key, v]) => {
        const previo = anterior.get(key)?.value ?? 0
        // Sin gasto previo no hay porcentaje posible: se marca como nuevo.
        return {
          key,
          name: v.name,
          value: v.value,
          variacion: previo > 0 ? ((v.value - previo) / previo) * 100 : null,
        }
      })
      .sort((a, b) => b.value - a.value)
  }, [gastoRows, gastoAnteriorRows, catById])

  const totalMes = torta.reduce((s, t) => s + t.value, 0)
  const [verTodas, setVerTodas] = useState(false)

  function filaCategoria(t: (typeof torta)[number], i: number) {
    return (
      <li key={t.key} className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2">
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: PALETA[i % PALETA.length] }}
          />
          <span className="truncate text-sm">{t.name}</span>
        </span>
        <div className="shrink-0 text-right">
          <p className="tabular text-sm">
            $ {formatearCentavos(t.value)}
            <span className="ml-2 text-xs text-muted-foreground">
              {Math.round((t.value / totalMes) * 100)}%
            </span>
          </p>
          <Variacion pct={t.variacion} />
        </div>
      </li>
    )
  }

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

  const etiquetaMes = mesAnio(anio, mes)
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
            <span className="min-w-32 text-center text-sm">{etiquetaMes}</span>
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
            <div className="relative h-60">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={torta}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={68}
                    outerRadius={92}
                    paddingAngle={2}
                    cornerRadius={5}
                    stroke="none"
                  >
                    {torta.map((_, i) => (
                      <Cell key={i} fill={PALETA[i % PALETA.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => tip(Number(v))} />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xs text-muted-foreground">Gasto del mes</span>
                <span className="tabular text-xl font-semibold">$ {formatearCentavos(totalMes)}</span>
              </div>
            </div>
            <ul className="space-y-2">
              {torta.slice(0, MAX_CATEGORIAS).map((t, i) => filaCategoria(t, i))}
            </ul>
            {torta.length > MAX_CATEGORIAS && (
              <Button variant="outline" className="w-full" onClick={() => setVerTodas(true)}>
                Ver todas ({torta.length})
              </Button>
            )}
            <Hoja abierta={verTodas} onOpenChange={setVerTodas} titulo="Gasto por categoría">
              <ul className="space-y-2">{torta.map((t, i) => filaCategoria(t, i))}</ul>
            </Hoja>
          </>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground">Ingresos y egresos del mes</h2>
        <BarraMes
          etiqueta="Ingresos"
          valor={ingresosMes}
          tope={topeMes}
          barra="bg-income"
          texto="text-income"
        />
        <BarraMes
          etiqueta="Egresos"
          valor={egresosMes}
          tope={topeMes}
          barra="bg-expense"
          texto="text-expense"
        />
        <div className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3 text-sm">
          <span className="text-muted-foreground">Resultado</span>
          <span
            className={cn(
              "tabular font-semibold",
              resultadoMes < 0 ? "text-expense" : "text-income",
            )}
          >
            {formatearSaldo(resultadoMes)}
          </span>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-muted-foreground">Evolución (6 meses)</h2>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-income" /> Ingresos
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-expense" /> Gastos
            </span>
          </div>
        </div>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={evolucion} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
              <defs>
                <linearGradient id="gradIngresos" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={colores.income} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={colores.income} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradGastos" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={colores.expense} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={colores.expense} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="etiqueta"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 12, fill: colores["muted-foreground"] }}
              />
              <Tooltip formatter={(v) => tip(Number(v))} />
              <Area
                type="monotone"
                dataKey="ingresos"
                name="Ingresos"
                stroke={colores.income}
                strokeWidth={2}
                fill="url(#gradIngresos)"
              />
              <Area
                type="monotone"
                dataKey="gastos"
                name="Gastos"
                stroke={colores.expense}
                strokeWidth={2}
                fill="url(#gradGastos)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground">Resultado por mes</h2>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={evolucion} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
              <XAxis
                dataKey="etiqueta"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 12, fill: colores["muted-foreground"] }}
              />
              <Tooltip formatter={(v) => tip(Number(v))} />
              <Bar dataKey="neto" name="Resultado" radius={6}>
                {evolucion.map((m) => (
                  <Cell
                    key={m.clave}
                    fill={m.neto < 0 ? colores.expense : colores.income}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  )
}
