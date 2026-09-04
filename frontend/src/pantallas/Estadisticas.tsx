import { useQuery } from "@powersync/react"
import { ArrowDown, ArrowUp, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react"
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
import { Segmentado } from "@/componentes/ui/segmentado"
import { useColoresTokens } from "@/hooks/useColoresTokens"
import { formatearCentavos, formatearMonto, formatearSaldo } from "@/lib/dinero"
import {
  type EtiquetaInfo,
  type GastoEtiqueta,
  type GastoEtiquetaRow,
  agruparPorEtiqueta,
} from "@/lib/etiquetas"
import { mesAnio } from "@/lib/fecha"
import { PALETA } from "@/lib/paleta"
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

// La leyenda muestra las mas representativas; el resto va en un dialogo.
const MAX_CATEGORIAS = 5
const MAX_ETIQUETAS = 6

// Barra de una etiqueta, con el color propio de la etiqueta. El ancho se mide
// contra la etiqueta mas grande, no contra el gasto total: un movimiento con
// varias etiquetas suma en todas y un porcentaje del total mentiria.
function FilaEtiqueta({ e, tope }: { e: GastoEtiqueta; tope: number }) {
  const pct = Math.min((e.total / tope) * 100, 100)
  return (
    <li className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="flex min-w-0 items-center gap-2">
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: e.color }}
            aria-hidden
          />
          <span className="truncate">{e.name}</span>
          {e.archived && <span className="shrink-0 text-xs text-muted-foreground">archivada</span>}
        </span>
        <span className="tabular shrink-0 font-medium">$ {formatearCentavos(e.total)}</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full"
            style={{ width: `${pct}%`, backgroundColor: e.color }}
          />
        </div>
        <span className="tabular shrink-0 text-xs text-muted-foreground">
          {e.n} mov{e.n === 1 ? "." : "s."}
        </span>
      </div>
    </li>
  )
}

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

    // Desglose: que hay adentro de cada categoria principal. El gasto cargado
    // directo en el padre (no en una hija) se llama "General", que es como se
    // lee en un resumen: el resto son las hijas con nombre propio.
    const desglose = new Map<string, { id: string; name: string; value: number }[]>()
    for (const r of gastoRows) {
      const cat = r.category_id ? catById.get(r.category_id) : undefined
      const padre = cat?.parent_id ? catById.get(cat.parent_id) : cat
      const key = padre?.id ?? "sin"
      const lista = desglose.get(key) ?? []
      lista.push({
        id: cat?.id ?? "sin",
        name: cat?.parent_id ? cat.name : "General",
        value: r.total,
      })
      desglose.set(key, lista)
    }

    return [...actual.entries()]
      .map(([key, v]) => {
        const previo = anterior.get(key)?.value ?? 0
        // Sin gasto previo no hay porcentaje posible: se marca como nuevo.
        return {
          key,
          name: v.name,
          value: v.value,
          variacion: previo > 0 ? ((v.value - previo) / previo) * 100 : null,
          desglose: (desglose.get(key) ?? []).sort((a, b) => b.value - a.value),
        }
      })
      .sort((a, b) => b.value - a.value)
  }, [gastoRows, gastoAnteriorRows, catById])

  const totalMes = torta.reduce((s, t) => s + t.value, 0)
  const [verTodas, setVerTodas] = useState(false)
  const [expandidas, setExpandidas] = useState<string[]>([])

  function alternarCategoria(key: string) {
    setExpandidas((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]))
  }

  function filaCategoria(t: (typeof torta)[number], i: number) {
    // Solo se puede desplegar lo que tiene mas de una parte adentro: con una
    // sola, el desglose repetiria la fila.
    const expandible = t.desglose.length > 1
    const abierta = expandidas.includes(t.key)

    const cuerpo = (
      <>
        <span className="flex min-w-0 items-center gap-2">
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: PALETA[i % PALETA.length] }}
          />
          <span className="truncate text-sm">{t.name}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <span className="text-right">
            <span className="tabular block text-sm">
              $ {formatearCentavos(t.value)}
              <span className="ml-2 text-xs text-muted-foreground">
                {Math.round((t.value / totalMes) * 100)}%
              </span>
            </span>
            <Variacion pct={t.variacion} />
          </span>
          {expandible && (
            <ChevronDown
              aria-hidden
              className={cn(
                "h-4 w-4 shrink-0 text-muted-foreground/40 motion-safe:transition-transform motion-safe:duration-200 motion-safe:ease-salida",
                abierta && "rotate-180",
              )}
            />
          )}
        </span>
      </>
    )

    return (
      <li key={t.key}>
        {expandible ? (
          <button
            type="button"
            onClick={() => alternarCategoria(t.key)}
            aria-expanded={abierta}
            className="-mx-2 flex w-[calc(100%+1rem)] items-center justify-between gap-3 rounded-lg px-2 py-1 text-left transition-colors hover:bg-muted/60"
          >
            {cuerpo}
          </button>
        ) : (
          <div className="flex items-center justify-between gap-3">{cuerpo}</div>
        )}
        {expandible && abierta && (
          <ul className="ml-1 mt-2 space-y-1.5 border-l border-border pl-4 motion-safe:animate-fundir">
            {t.desglose.map((d) => (
              <li key={d.id} className="flex items-baseline justify-between gap-3 text-xs">
                <span className="truncate text-muted-foreground">{d.name}</span>
                <span className="tabular shrink-0 text-muted-foreground">
                  $ {formatearCentavos(d.value)}
                  <span className="ml-2">{Math.round((d.value / t.value) * 100)}%</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </li>
    )
  }

  // Gasto por etiqueta. Un proyecto (un viaje, una refaccion) cruza meses, asi
  // que el default es el acumulado; el selector permite acotarlo al mes que se
  // esta viendo arriba. Los limites se pasan siempre como parametros para no
  // tener dos consultas condicionales.
  const [alcanceEtiquetas, setAlcanceEtiquetas] = useState<"todo" | "mes">("todo")
  const desdeTags = alcanceEtiquetas === "mes" ? inicioMes : "0000-01-01T00:00:00.000Z"
  const hastaTags = alcanceEtiquetas === "mes" ? finMes : "9999-12-31T00:00:00.000Z"

  // Se traen tambien las archivadas: un movimiento viejo puede llevar una
  // etiqueta ya archivada y ese gasto igual cuenta.
  const { data: todasEtiquetas } = useQuery<EtiquetaInfo>(
    "SELECT id, name, color, archived FROM tags WHERE deleted_at IS NULL",
  )
  const { data: gastoEtiquetaRows } = useQuery<GastoEtiquetaRow>(
    `SELECT tt.tag_id AS id, SUM(t.amount) AS total, COUNT(*) AS n
     FROM transaction_tags tt JOIN transactions t ON t.id = tt.transaction_id
     WHERE tt.deleted_at IS NULL AND t.deleted_at IS NULL
       AND t.kind='expense' AND t.status='confirmed'
       AND t.occurred_at >= ? AND t.occurred_at < ?
     GROUP BY tt.tag_id`,
    [desdeTags, hastaTags],
  )
  const porEtiqueta = useMemo(
    () => agruparPorEtiqueta(gastoEtiquetaRows, todasEtiquetas),
    [gastoEtiquetaRows, todasEtiquetas],
  )
  const topeEtiquetas = Math.max(...porEtiqueta.map((e) => e.total), 1)
  const [verTodasEtiquetas, setVerTodasEtiquetas] = useState(false)

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
                <span className="tabular text-xl font-semibold">
                  $ {formatearCentavos(totalMes)}
                </span>
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

      {todasEtiquetas.length > 0 && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-muted-foreground">Gasto por etiqueta</h2>
            <Segmentado
              opciones={[
                { valor: "todo", etiqueta: "Acumulado" },
                { valor: "mes", etiqueta: etiquetaMes },
              ]}
              valor={alcanceEtiquetas}
              onCambio={setAlcanceEtiquetas}
            />
          </div>

          {porEtiqueta.length === 0 ? (
            <p className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
              {alcanceEtiquetas === "mes"
                ? "Sin gastos etiquetados en este mes."
                : "Sin gastos etiquetados todavía."}
            </p>
          ) : (
            <>
              <ul className="space-y-3 rounded-xl border border-border bg-card p-4">
                {porEtiqueta.slice(0, MAX_ETIQUETAS).map((e) => (
                  <FilaEtiqueta key={e.id} e={e} tope={topeEtiquetas} />
                ))}
              </ul>
              {porEtiqueta.length > MAX_ETIQUETAS && (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setVerTodasEtiquetas(true)}
                >
                  Ver todas ({porEtiqueta.length})
                </Button>
              )}
              <Hoja
                abierta={verTodasEtiquetas}
                onOpenChange={setVerTodasEtiquetas}
                titulo="Gasto por etiqueta"
              >
                <ul className="space-y-3">
                  {porEtiqueta.map((e) => (
                    <FilaEtiqueta key={e.id} e={e} tope={topeEtiquetas} />
                  ))}
                </ul>
              </Hoja>
              <p className="px-1 text-xs text-muted-foreground">
                Un movimiento con varias etiquetas suma en todas, así que el total de acá puede
                superar el gasto del período. El gasto sin etiquetar no aparece.
              </p>
            </>
          )}
        </section>
      )}

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
                  <Cell key={m.clave} fill={m.neto < 0 ? colores.expense : colores.income} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  )
}
