import { useQuery } from "@powersync/react"
import { ArrowDown, ArrowUp, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react"
import { useMemo, useState } from "react"
import { Link } from "react-router-dom"
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

import { Monto } from "@/componentes/Monto"
import { SelectorMoneda } from "@/componentes/SelectorMoneda"
import { Button } from "@/componentes/ui/button"
import { Hoja } from "@/componentes/ui/hoja"
import { Cargando, Esqueleto, useDemora } from "@/componentes/ui/cargando"
import { Segmentado } from "@/componentes/ui/segmentado"
import { useColoresTokens } from "@/hooks/useColoresTokens"
import { useMonedaBase } from "@/hooks/monedaBase"
import { useRefrescoCotizaciones } from "@/hooks/refrescoCotizaciones"
import { formatearMonto } from "@/lib/dinero"
import {
  type EtiquetaInfo,
  type GastoEtiqueta,
  type GastoEtiquetaRow,
  agruparPorEtiqueta,
} from "@/lib/etiquetas"
import { mesAnio } from "@/lib/fecha"
import { type MovimientoConvertible, convertirTodos } from "@/lib/historico"
import { monedaPorDefecto, ordenarMonedas } from "@/lib/monedas"
import type { CotizacionConocida } from "@/lib/patrimonio"
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

// Fila a grano de movimiento: lo minimo para poder convertirla (ver
// lib/historico) mas lo que agrupa cada informe.
interface MovRow extends MovimientoConvertible {
  kind: "income" | "expense"
  category_id: string | null
}
interface EvoRow extends MovimientoConvertible {
  kind: "income" | "expense"
}
interface TagRow extends MovimientoConvertible {
  id: string
}

// Toda la pantalla se lee en UNA moneda, con dos modos (decision 0005):
//
// - **Global**: todo llevado a la moneda elegida, cada movimiento con la
//   cotizacion de SU dia. Lo gastado en marzo no cambia porque hoy salto el
//   dolar; por eso NO se usa la ultima cotizacion, que es lo que corresponde al
//   patrimonio y no a un informe historico.
// - **Por moneda**: solo lo que ya esta en esa moneda, sin convertir. Es el
//   numero exacto.
//
// Lo que no se puede convertir queda AFUERA del total y se informa al pie; nunca
// se estima. El modo se guarda por dispositivo: es una preferencia de lectura.
const LS_VISTA = "mango.statsVista"

type Vista = "global" | "moneda"

// Columnas que necesita la conversion. `moneda_cuenta` sale del join con la
// cuenta debitada: si esta justo en la moneda que se lee, `amount_account` es el
// monto real del resumen y no hace falta ninguna cotizacion.
const COLS = "t.amount, t.currency, t.occurred_at, t.amount_account, a.currency AS moneda_cuenta"
const JOIN = "LEFT JOIN accounts a ON a.id = t.account_id"

// Movimientos de un mes, los dos tipos. De aca salen el gasto por categoria y
// los totales de ingresos/egresos: una sola consulta para las dos cosas.
const SQL_MES = `
  SELECT t.category_id, t.kind, ${COLS}
  FROM transactions t ${JOIN}
  WHERE t.kind IN ('income','expense') AND t.status='confirmed' AND t.deleted_at IS NULL
    AND t.occurred_at >= ? AND t.occurred_at < ?`

const SQL_ETIQUETAS = `
  SELECT tt.tag_id AS id, ${COLS}
  FROM transaction_tags tt
  JOIN transactions t ON t.id = tt.transaction_id
  ${JOIN}
  WHERE tt.deleted_at IS NULL AND t.deleted_at IS NULL
    AND t.kind='expense' AND t.status='confirmed'
    AND t.occurred_at >= ? AND t.occurred_at < ?`

const SQL_EVO = `
  SELECT t.kind, ${COLS}
  FROM transactions t ${JOIN}
  WHERE t.kind IN ('income','expense') AND t.status='confirmed' AND t.deleted_at IS NULL
    AND t.occurred_at >= ?`

// La serie COMPLETA, no una por par: un informe historico necesita poder elegir
// la de cada fecha. A igual fecha gana lo cargado a mano sobre lo automatico
// (ver 0005), y eso va escrito igual en el servidor y aca.
const SQL_COTIZACIONES = `
  SELECT base_currency, quote_currency, rate, rate_date
  FROM exchange_rates WHERE deleted_at IS NULL
  ORDER BY rate_date DESC, (source = 'auto') ASC, created_at DESC`

// Pasa las filas a la moneda que se esta leyendo y descarta lo que no se pudo
// convertir, diciendo que monedas quedaron afuera.
function useValores<T extends MovimientoConvertible>(
  filas: T[],
  moneda: string,
  global: boolean,
  cotizaciones: CotizacionConocida[],
): { filas: (T & { valor: number })[]; sinCotizacion: string[] } {
  return useMemo(() => {
    if (!global) {
      return {
        filas: filas
          .filter((f) => f.currency.trim().toUpperCase() === moneda)
          .map((f) => ({ ...f, valor: f.amount })),
        sinCotizacion: [],
      }
    }
    const { filas: convertidas, sinCotizacion } = convertirTodos(filas, moneda, cotizaciones)
    return {
      filas: convertidas.flatMap(({ fila, convertido }) =>
        convertido === null ? [] : [{ ...fila, valor: convertido }],
      ),
      sinCotizacion,
    }
  }, [filas, moneda, global, cotizaciones])
}

// Suma por categoria, en la forma que espera el grafico.
function porCategoria(filas: { category_id: string | null; valor: number }[]): GastoRow[] {
  const acc = new Map<string | null, number>()
  for (const f of filas) acc.set(f.category_id, (acc.get(f.category_id) ?? 0) + f.valor)
  return [...acc].map(([category_id, total]) => ({ category_id, total }))
}

// La leyenda muestra las mas representativas; el resto va en un dialogo.
const MAX_CATEGORIAS = 5
const MAX_ETIQUETAS = 6

// Barra de una etiqueta, con el color propio de la etiqueta. El ancho se mide
// contra la etiqueta mas grande, no contra el gasto total: un movimiento con
// varias etiquetas suma en todas y un porcentaje del total mentiria.
function FilaEtiqueta({ e, tope, moneda }: { e: GastoEtiqueta; tope: number; moneda: string }) {
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
        <Monto
          centavos={e.total}
          moneda={moneda}
          variante="lista"
          className="shrink-0 font-medium"
        />
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
  moneda,
}: {
  etiqueta: string
  valor: number
  tope: number
  barra: string
  texto: string
  moneda: string
}) {
  const pct = Math.min((valor / tope) * 100, 100)
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{etiqueta}</span>
        <Monto centavos={valor} moneda={moneda} className={cn("font-semibold", texto)} />
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

  // Monedas con datos, para el selector. La pantalla se abre en la base.
  const base = useMonedaBase()
  const { data: monedaRows, isLoading: cargaMonedas } = useQuery<{ currency: string }>(
    "SELECT DISTINCT currency FROM transactions WHERE deleted_at IS NULL AND status='confirmed'",
  )
  const monedas = useMemo(
    () =>
      ordenarMonedas(
        monedaRows.map((r) => r.currency),
        base,
      ),
    [monedaRows, base],
  )
  const [monedaElegida, setMonedaElegida] = useState<string | null>(null)
  const moneda = monedaElegida ?? monedaPorDefecto(monedas, base)

  const [vista, setVista] = useState<Vista>(
    () => (localStorage.getItem(LS_VISTA) as Vista) ?? "global",
  )
  // Con una sola moneda no hay nada que unificar: el control seria ruido y el
  // modo da lo mismo.
  const unaSola = monedas.length <= 1
  const global = vista === "global" && !unaSola
  function cambiarVista(v: Vista) {
    setVista(v)
    localStorage.setItem(LS_VISTA, v)
  }

  const { data: cotizaciones } = useQuery<CotizacionConocida>(SQL_COTIZACIONES)

  const { data: categorias, isLoading: cargaCats } = useQuery<CatRow>(
    "SELECT id, name, parent_id FROM categories WHERE deleted_at IS NULL",
  )
  const catById = useMemo(() => new Map(categorias.map((c) => [c.id, c])), [categorias])

  const inicioMes = new Date(anio, mes, 1).toISOString()
  const finMes = new Date(anio, mes + 1, 1).toISOString()
  const inicioMesAnterior = new Date(anio, mes - 1, 1).toISOString()

  // Las consultas NO filtran por moneda: traen todo y el modo se resuelve al
  // convertir. Asi hay una sola forma de consulta en vez de dos condicionales,
  // y cambiar de modo no vuelve a pegarle a la base.
  const { data: mesRows, isLoading: cargaMes } = useQuery<MovRow>(SQL_MES, [inicioMes, finMes])
  const { data: mesAnteriorRows } = useQuery<MovRow>(SQL_MES, [inicioMesAnterior, inicioMes])

  const valoresMes = useValores(mesRows, moneda, global, cotizaciones)
  const valoresAnterior = useValores(mesAnteriorRows, moneda, global, cotizaciones)

  const gastoRows = useMemo(
    () => porCategoria(valoresMes.filas.filter((f) => f.kind === "expense")),
    [valoresMes],
  )
  const gastoAnteriorRows = useMemo(
    () => porCategoria(valoresAnterior.filas.filter((f) => f.kind === "expense")),
    [valoresAnterior],
  )

  // Totales del mes elegido, para las barras de ingresos vs egresos.
  const sumar = (kind: MovRow["kind"]) =>
    valoresMes.filas.reduce((s, f) => (f.kind === kind ? s + f.valor : s), 0)
  const ingresosMes = sumar("income")
  const egresosMes = sumar("expense")
  const resultadoMes = ingresosMes - egresosMes
  const topeMes = Math.max(ingresosMes, egresosMes, 1)

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
            <span className="block text-sm">
              <Monto centavos={t.value} moneda={moneda} variante="lista" />
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
                <span className="shrink-0 text-muted-foreground">
                  <Monto centavos={d.value} moneda={moneda} variante="lista" />
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
  const { data: etiquetaRows } = useQuery<TagRow>(SQL_ETIQUETAS, [desdeTags, hastaTags])
  const valoresEtiquetas = useValores(etiquetaRows, moneda, global, cotizaciones)
  const gastoEtiquetaRows = useMemo<GastoEtiquetaRow[]>(() => {
    const acc = new Map<string, GastoEtiquetaRow>()
    for (const f of valoresEtiquetas.filas) {
      const cur = acc.get(f.id) ?? { id: f.id, total: 0, n: 0 }
      cur.total += f.valor
      cur.n += 1
      acc.set(f.id, cur)
    }
    return [...acc.values()]
  }, [valoresEtiquetas])
  const porEtiqueta = useMemo(
    () => agruparPorEtiqueta(gastoEtiquetaRows, todasEtiquetas),
    [gastoEtiquetaRows, todasEtiquetas],
  )
  const topeEtiquetas = Math.max(...porEtiqueta.map((e) => e.total), 1)
  const [verTodasEtiquetas, setVerTodasEtiquetas] = useState(false)

  // Evolucion: ultimos 6 meses.
  const inicioEvo = new Date(hoy.getFullYear(), hoy.getMonth() - 5, 1).toISOString()
  const { data: evoRowsCrudas } = useQuery<EvoRow>(SQL_EVO, [inicioEvo])
  const valoresEvo = useValores(evoRowsCrudas, moneda, global, cotizaciones)
  const evoRows = valoresEvo.filas
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
      if (r.kind === "income") meses[i].ingresos += r.valor
      else meses[i].gastos += r.valor
    }
    return meses.map((m) => ({ ...m, neto: m.ingresos - m.gastos }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evoRows])

  const etiquetaMes = mesAnio(anio, mes)

  // Lo que no se pudo convertir queda afuera del total y se dice; nunca se
  // estima. Y se pide la cotizacion en el momento: una moneda nueva no deberia
  // obligar a recargar la app (ver 0005).
  const faltantes = useMemo(
    () =>
      [
        ...new Set([
          ...valoresMes.sinCotizacion,
          ...valoresAnterior.sinCotizacion,
          ...valoresEtiquetas.sinCotizacion,
          ...valoresEvo.sinCotizacion,
        ]),
      ].sort(),
    [valoresMes, valoresAnterior, valoresEtiquetas, valoresEvo],
  )
  useRefrescoCotizaciones(faltantes)

  // Mientras la primera consulta no volvio, la pantalla NO afirma nada: sin
  // este corte se dibuja "Sin gastos este mes" y "$ 0,00", y despues todo
  // salta (ver 0008). Solo entran las consultas que deciden la estructura;
  // las de detalle (etiquetas, evolucion) llegan dentro del mismo render.
  const cargando = cargaMonedas || cargaCats || cargaMes
  // El umbral solo decide si el esqueleto se VE; el corte es `cargando`.
  const mostrarEsqueleto = useDemora(cargando)
  const tip = (v: number) => formatearMonto(v, { moneda })

  function cambiarMes(delta: number) {
    const d = new Date(anio, mes + delta, 1)
    setAnio(d.getFullYear())
    setMes(d.getMonth())
  }

  if (cargando) {
    return (
      <div className="mx-auto max-w-2xl space-y-8 p-4">
        <h1 className="text-2xl font-semibold">Estadísticas</h1>
        <Cargando visible={mostrarEsqueleto} className="space-y-8" etiqueta="Cargando estadísticas">
          {/* Los esqueletos tienen el tamano de lo que viene, asi el contenido
              no empuja nada al llegar. */}
          <div className="space-y-3">
            <Esqueleto className="h-4 w-40" />
            <Esqueleto className="mx-auto h-48 w-48 rounded-full" />
            <Esqueleto className="h-4 w-full" />
            <Esqueleto className="h-4 w-3/4" />
          </div>
          <div className="space-y-3">
            <Esqueleto className="h-20 w-full rounded-xl" />
            <Esqueleto className="h-20 w-full rounded-xl" />
          </div>
        </Cargando>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Estadísticas</h1>
        {/* Con una sola moneda no hay nada que unificar. */}
        {!unaSola && (
          <Segmentado
            opciones={[
              { valor: "global", etiqueta: "Global" },
              { valor: "moneda", etiqueta: "Por moneda" },
            ]}
            valor={vista}
            onCambio={cambiarVista}
          />
        )}
      </div>
      {/* El modo ya lo dicen los chips y la moneda el selector: no hace falta
          explicarlo abajo (DESIGN.md 7). Solo se avisa lo que quedo afuera. */}
      <div className="-mt-6 space-y-1">
        <SelectorMoneda monedas={monedas} valor={moneda} onCambio={setMonedaElegida} />
        {faltantes.length > 0 && (
          <p className="text-xs text-muted-foreground">
            No incluye {faltantes.join(", ")}: falta su cotización.{" "}
            <Link to="/cotizaciones" className="text-primary underline-offset-2 hover:underline">
              Cargarla
            </Link>
            .
          </p>
        )}
      </div>

      <section className="space-y-3">
        {/* flex-wrap + nowrap: si no entran en una linea, el selector de mes baja
            entero en vez de partir el titulo al medio. */}
        <div className="flex flex-wrap items-center justify-between gap-x-2">
          <h2 className="whitespace-nowrap text-sm font-semibold text-muted-foreground">
            Gasto por categoría
          </h2>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => cambiarMes(-1)}
              aria-label="Mes anterior"
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <span className="min-w-32 whitespace-nowrap text-center text-sm">{etiquetaMes}</span>
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
            {/* Tamano fijo, sin ResponsiveContainer: los radios de la dona ya
                son fijos, asi que el contenedor no aportaba nada y su ciclo de
                medicion dejaba el anillo en blanco ~100 ms (ver 0008). */}
            <div className="relative mx-auto h-60 w-60">
              <PieChart width={240} height={240}>
                <Pie
                  // Sin animacion de entrada: recharts la hace en 1,5 s y
                  // deja el anillo a medio dibujar. Los datos que se leen no
                  // se animan (DESIGN.md 8).
                  isAnimationActive={false}
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
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xs text-muted-foreground">Gasto del mes</span>
                <Monto centavos={totalMes} moneda={moneda} className="text-xl font-semibold" />
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
                  <FilaEtiqueta key={e.id} e={e} tope={topeEtiquetas} moneda={moneda} />
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
                    <FilaEtiqueta key={e.id} e={e} tope={topeEtiquetas} moneda={moneda} />
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
          moneda={moneda}
        />
        <BarraMes
          etiqueta="Egresos"
          valor={egresosMes}
          tope={topeMes}
          barra="bg-expense"
          texto="text-expense"
          moneda={moneda}
        />
        <div className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3 text-sm">
          <span className="text-muted-foreground">Resultado</span>
          <Monto
            centavos={resultadoMes}
            moneda={moneda}
            className={cn("font-semibold", resultadoMes < 0 ? "text-expense" : "text-income")}
          />
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
                isAnimationActive={false}
                type="monotone"
                dataKey="ingresos"
                name="Ingresos"
                stroke={colores.income}
                strokeWidth={2}
                fill="url(#gradIngresos)"
              />
              <Area
                isAnimationActive={false}
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
              <Bar isAnimationActive={false} dataKey="neto" name="Resultado" radius={6}>
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
