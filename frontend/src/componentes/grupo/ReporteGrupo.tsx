import { useQuery } from "@powersync/react"
import { useMemo, useState } from "react"

import { Monto } from "@/componentes/Monto"
import { FilaInset, ListaInset } from "@/componentes/ui/listaInset"
import { Segmentado } from "@/componentes/ui/segmentado"
import { useGrupo } from "@/hooks/useGrupo"
import { formatearMonto } from "@/lib/dinero"
import { resumenGrupo, type TxGrupo } from "@/lib/grupo"
import { convertirTodos } from "@/lib/historico"
import { iconoDe } from "@/lib/iconos"
import { TX_GRUPO } from "@/lib/lente"
import type { CotizacionConocida } from "@/lib/patrimonio"

// Estadisticas del grupo (0026): cuanto gasto el grupo en el periodo, en que y
// quien puso. Global = todo a la moneda del grupo con la cotizacion del momento
// de cada gasto (0005); Por moneda = exacto, sin convertir. Salio del viejo
// ResumenGrupo: el balance y Saldar estan en el Inicio del grupo.

const PERIODOS: { valor: "mes" | "todo"; etiqueta: string }[] = [
  { valor: "mes", etiqueta: "Este mes" },
  { valor: "todo", etiqueta: "Todo" },
]

const MODOS: { valor: "global" | "moneda"; etiqueta: string }[] = [
  { valor: "global", etiqueta: "Global" },
  { valor: "moneda", etiqueta: "Por moneda" },
]

const SQL_COTIZACIONES = `
  SELECT base_currency, quote_currency, rate, rate_date
  FROM exchange_rates WHERE deleted_at IS NULL
  ORDER BY rate_date DESC, (source = 'auto') ASC, created_at DESC`

// Fila del reporte: lo de TxGrupo mas lo que hace falta para convertir un gasto
// a la moneda base (ver lib/historico). En los gastos de otros miembros,
// amount_account/moneda_cuenta vienen NULL (su cuenta no viaja): caen a la serie.
interface FilaReporte extends TxGrupo {
  occurred_at: string
  amount_account: number | null
  moneda_cuenta: string | null
}

export function ReporteGrupo({ groupId }: { groupId: string }) {
  const [periodo, setPeriodo] = useState<"mes" | "todo">("mes")
  const [modo, setModo] = useState<"global" | "moneda">("global")
  const { miembros, categoria: catInfo, nombre } = useGrupo(groupId)

  // Gastos del periodo (para el reporte de "cuanto se gasto"). Trae ademas lo
  // necesario para convertir a la moneda base (occurred_at, monto/moneda debitada).
  const COLS_REPORTE =
    "t.id, t.owner_id, t.amount, t.currency, t.category_id, t.kind, t.paid_from_group," +
    " t.occurred_at, t.amount_account, a.currency AS moneda_cuenta"
  const FROM_REPORTE =
    `FROM ${TX_GRUPO} t LEFT JOIN accounts a ON a.id = t.account_id` +
    " WHERE t.group_id = ? AND t.visibility = 'shared' AND t.deleted_at IS NULL AND t.kind = 'expense'"
  const { sql, params } = useMemo(() => {
    if (periodo === "todo")
      return { sql: `SELECT ${COLS_REPORTE} ${FROM_REPORTE}`, params: [groupId] }
    const hoy = new Date()
    const inicio = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString()
    const fin = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 1).toISOString()
    return {
      sql: `SELECT ${COLS_REPORTE} ${FROM_REPORTE} AND t.occurred_at >= ? AND t.occurred_at < ?`,
      params: [groupId, inicio, fin],
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, periodo])
  const { data: txsPeriodo } = useQuery<FilaReporte>(sql, params)

  // Moneda base del grupo y cotizaciones (para el modo Global). Las cotizaciones
  // son globales y ya sincronizan; base_currency viene del grupo.
  const { data: grupoRows } = useQuery<{ base_currency: string }>(
    "SELECT base_currency FROM groups WHERE id = ?",
    [groupId],
  )
  const base = grupoRows[0]?.base_currency ?? "ARS"
  const { data: cotizaciones } = useQuery<CotizacionConocida>(SQL_COTIZACIONES)

  const reporte = useMemo(() => resumenGrupo(txsPeriodo, miembros), [txsPeriodo, miembros])

  // Reporte Global: todo convertido a la moneda base del grupo, con la cotizacion
  // del momento de cada gasto. Lo que no se pudo convertir queda afuera y se avisa.
  const global = useMemo(() => {
    const { filas, sinCotizacion } = convertirTodos(txsPeriodo, base, cotizaciones)
    let total = 0
    const porCat = new Map<string | null, number>()
    for (const { fila, convertido } of filas) {
      if (convertido == null) continue
      total += convertido
      porCat.set(fila.category_id, (porCat.get(fila.category_id) ?? 0) + convertido)
    }
    const porCategoria = [...porCat.entries()]
      .map(([category_id, t]) => ({ category_id, total: t }))
      .sort((a, b) => b.total - a.total)
    return { total, porCategoria, sinCotizacion }
  }, [txsPeriodo, base, cotizaciones])

  // Quien puso cuanto en el periodo (por moneda: no se mezclan sin convertir).
  const porMiembro = reporte.flatMap((r) =>
    r.porMiembro.map((m) => ({ ...m, currency: r.currency })),
  )

  return (
    <section className="space-y-4">
      {/* Reporte de gasto del periodo */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-muted-foreground">Gasto del grupo</h2>
          <div className="flex items-center gap-2">
            <Segmentado opciones={MODOS} valor={modo} onCambio={setModo} etiqueta="Monedas" />
            <Segmentado
              opciones={PERIODOS}
              valor={periodo}
              onCambio={setPeriodo}
              etiqueta="Período"
            />
          </div>
        </div>

        {txsPeriodo.length === 0 ? (
          <p className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
            {periodo === "mes" ? "Sin gastos compartidos este mes." : "Sin gastos compartidos."}
          </p>
        ) : modo === "global" ? (
          <div className="space-y-3">
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground">Total del grupo</p>
              <p className="tabular text-2xl font-semibold">
                {formatearMonto(global.total, { moneda: base })}
              </p>
            </div>
            <div>
              <h3 className="mb-1 text-xs font-semibold text-muted-foreground">Por categoría</h3>
              <ListaInset>
                {global.porCategoria.map((c) => {
                  const info = c.category_id ? catInfo.get(c.category_id) : undefined
                  const Icono = iconoDe(info?.icon ?? null)
                  return (
                    <FilaInset key={c.category_id ?? "sin"}>
                      <span className="flex min-w-0 items-center gap-3">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                          <Icono className="h-4 w-4 text-muted-foreground" aria-hidden />
                        </span>
                        <span className="truncate">{info?.name ?? "Sin categoría"}</span>
                      </span>
                      <Monto
                        centavos={c.total}
                        moneda={base}
                        variante="lista"
                        className="font-medium"
                      />
                    </FilaInset>
                  )
                })}
              </ListaInset>
              {global.sinCotizacion.length > 0 && (
                <p className="mt-1 px-1 text-xs text-muted-foreground">
                  Sin cotización, afuera del total: {global.sinCotizacion.join(", ")}.
                </p>
              )}
            </div>
          </div>
        ) : (
          reporte.map((r) => (
            <div key={r.currency} className="space-y-3">
              {reporte.length > 1 && (
                <p className="text-xs font-medium text-muted-foreground">{r.currency}</p>
              )}
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-xs text-muted-foreground">Total del grupo</p>
                <p className="tabular text-2xl font-semibold">
                  {formatearMonto(r.total, { moneda: r.currency })}
                </p>
              </div>
              <div>
                <h3 className="mb-1 text-xs font-semibold text-muted-foreground">Por categoría</h3>
                <ListaInset>
                  {r.porCategoria.map((c) => {
                    const info = c.category_id ? catInfo.get(c.category_id) : undefined
                    const Icono = iconoDe(info?.icon ?? null)
                    return (
                      <FilaInset key={c.category_id ?? "sin"}>
                        <span className="flex min-w-0 items-center gap-3">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                            <Icono className="h-4 w-4 text-muted-foreground" aria-hidden />
                          </span>
                          <span className="truncate">{info?.name ?? "Sin categoría"}</span>
                        </span>
                        <Monto
                          centavos={c.total}
                          moneda={r.currency}
                          variante="lista"
                          className="font-medium"
                        />
                      </FilaInset>
                    )
                  })}
                </ListaInset>
              </div>
            </div>
          ))
        )}
      </div>

      {porMiembro.length > 0 && (
        <div>
          <h2 className="mb-1 text-sm font-semibold text-muted-foreground">Quién puso</h2>
          <ListaInset>
            {porMiembro.map((m) => (
              <FilaInset key={`${m.user_id}-${m.currency}`}>
                <span className="truncate">{nombre(m.user_id)}</span>
                <Monto
                  centavos={m.total}
                  moneda={m.currency}
                  variante="lista"
                  className="font-medium"
                />
              </FilaInset>
            ))}
          </ListaInset>
          <p className="mt-1 px-1 text-xs text-muted-foreground">
            Lo que pagó cada uno de su bolsillo. Lo pagado con la cuenta conjunta no cuenta acá.
          </p>
        </div>
      )}
    </section>
  )
}
