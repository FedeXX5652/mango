import { usePowerSync, useQuery } from "@powersync/react"
import { ArrowRight, Undo2 } from "lucide-react"
import { useMemo, useState } from "react"

import { Button } from "@/componentes/ui/button"
import { Monto } from "@/componentes/Monto"
import { SaldarPago, type Liquidacion } from "@/componentes/SaldarPago"
import { FilaInset, ListaInset } from "@/componentes/ui/listaInset"
import { Segmentado } from "@/componentes/ui/segmentado"
import { formatearMonto } from "@/lib/dinero"
import { formatearFechaCorta } from "@/lib/fecha"
import {
  resumenGrupo,
  type MiembroGrupo,
  type SettlementRow,
  type SplitRow,
  type TxGrupo,
} from "@/lib/grupo"
import { convertirTodos } from "@/lib/historico"
import { iconoDe } from "@/lib/iconos"
import type { CotizacionConocida } from "@/lib/patrimonio"
import { usuarioActualId } from "@/lib/sesion"

// Resumen del grupo (fase 3b.3): cuanto gasto (por periodo), y el balance TOTAL
// con splits desiguales y los pagos ya registrados (0015). El reporte de gasto
// mira el periodo elegido; el balance es siempre acumulado (una deuda no es de un
// mes). Todo se calcula en el cliente (lib/grupo) sobre lo que bajo por la sync.

const PERIODOS: { valor: "mes" | "todo"; etiqueta: string }[] = [
  { valor: "mes", etiqueta: "Este mes" },
  { valor: "todo", etiqueta: "Todo" },
]

// Global = todo a la moneda del grupo, con la cotizacion del momento de cada
// gasto (ver 0005). Por moneda = exacto, sin convertir. Igual que Estadisticas.
const MODOS: { valor: "global" | "moneda"; etiqueta: string }[] = [
  { valor: "global", etiqueta: "Global" },
  { valor: "moneda", etiqueta: "Por moneda" },
]

const SQL_COTIZACIONES = `
  SELECT base_currency, quote_currency, rate, rate_date
  FROM exchange_rates WHERE deleted_at IS NULL
  ORDER BY rate_date DESC, (source = 'auto') ASC, created_at DESC`

interface CatInfo {
  id: string
  name: string
  icon: string | null
}

// Fila del reporte: lo de TxGrupo mas lo que hace falta para convertir un gasto
// a la moneda base (ver lib/historico). En los gastos de otros miembros,
// amount_account/moneda_cuenta vienen NULL (su cuenta no viaja): caen a la serie.
interface FilaReporte extends TxGrupo {
  occurred_at: string
  amount_account: number | null
  moneda_cuenta: string | null
}

const BASE_TX =
  "FROM transactions WHERE group_id = ? AND visibility = 'shared' AND deleted_at IS NULL AND kind = 'expense'"

export function ResumenGrupo({ groupId }: { groupId: string }) {
  const db = usePowerSync()
  const [periodo, setPeriodo] = useState<"mes" | "todo">("mes")
  const [modo, setModo] = useState<"global" | "moneda">("global")
  const miId = usuarioActualId() ?? ""

  // Gastos del periodo (para el reporte de "cuanto se gasto"). Trae ademas lo
  // necesario para convertir a la moneda base (occurred_at, monto/moneda debitada).
  const COLS_REPORTE =
    "t.id, t.owner_id, t.amount, t.currency, t.category_id, t.kind, t.paid_from_group," +
    " t.occurred_at, t.amount_account, a.currency AS moneda_cuenta"
  const FROM_REPORTE =
    "FROM transactions t LEFT JOIN accounts a ON a.id = t.account_id" +
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

  // Todos los gastos compartidos (para el balance acumulado).
  const { data: txsTodo } = useQuery<TxGrupo>(
    `SELECT id, owner_id, amount, currency, category_id, kind, paid_from_group ${BASE_TX}`,
    [groupId],
  )
  const { data: splits } = useQuery<SplitRow>(
    `SELECT s.transaction_id, s.user_id, s.amount
     FROM transaction_splits s JOIN transactions t ON t.id = s.transaction_id
     WHERE t.group_id = ? AND t.visibility = 'shared' AND t.deleted_at IS NULL AND s.deleted_at IS NULL`,
    [groupId],
  )
  const { data: pagos } = useQuery<{
    id: string
    from_user_id: string
    to_user_id: string
    amount: number
    currency: string
    occurred_at: string
    account_id: string | null
  }>(
    `SELECT id, from_user_id, to_user_id, amount, currency, occurred_at, account_id
     FROM settlements WHERE group_id = ? AND deleted_at IS NULL ORDER BY occurred_at DESC`,
    [groupId],
  )

  const { data: miembrosRows } = useQuery<{ user_id: string; display_name: string | null }>(
    `SELECT gm.user_id, u.display_name FROM group_members gm LEFT JOIN users u ON u.id = gm.user_id
     WHERE gm.group_id = ? AND gm.deleted_at IS NULL`,
    [groupId],
  )
  const { data: catsRows } = useQuery<CatInfo>(
    "SELECT id, name, icon FROM categories WHERE group_id = ? AND deleted_at IS NULL",
    [groupId],
  )

  const miembros: MiembroGrupo[] = useMemo(
    () =>
      miembrosRows.map((m) => ({
        user_id: m.user_id,
        nombre: m.display_name || m.user_id.slice(0, 8),
      })),
    [miembrosRows],
  )
  const catInfo = useMemo(() => new Map(catsRows.map((c) => [c.id, c])), [catsRows])

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

  const settlements: SettlementRow[] = pagos
  const balance = useMemo(
    () => resumenGrupo(txsTodo, miembros, { splits, settlements }),
    [txsTodo, miembros, splits, settlements],
  )

  const nombre = (userId: string) =>
    userId === miId ? "Vos" : (miembros.find((m) => m.user_id === userId)?.nombre ?? "Otro")

  const [pagando, setPagando] = useState<Liquidacion | null>(null)
  async function deshacer(id: string) {
    await db.execute("DELETE FROM settlements WHERE id = ?", [id])
  }

  return (
    <section className="space-y-5">
      {/* Reporte de gasto del periodo */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-muted-foreground">Resumen</h2>
          <div className="flex items-center gap-2">
            <Segmentado opciones={MODOS} valor={modo} onCambio={setModo} />
            <Segmentado opciones={PERIODOS} valor={periodo} onCambio={setPeriodo} />
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
                      <span className="flex min-w-0 items-center gap-2.5">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                          <Icono className="h-4 w-4 text-muted-foreground" aria-hidden />
                        </span>
                        <span className="truncate">{info?.name ?? "Sin categoría"}</span>
                      </span>
                      <Monto centavos={c.total} moneda={base} variante="lista" className="font-medium" />
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
                        <span className="flex min-w-0 items-center gap-2.5">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                            <Icono className="h-4 w-4 text-muted-foreground" aria-hidden />
                          </span>
                          <span className="truncate">{info?.name ?? "Sin categoría"}</span>
                        </span>
                        <Monto centavos={c.total} moneda={r.currency} variante="lista" className="font-medium" />
                      </FilaInset>
                    )
                  })}
                </ListaInset>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Balance total (acumulado): partes iguales o splits, menos los pagos */}
      {balance.map((r) => (
        <div key={r.currency} className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground">
            Balance {balance.length > 1 ? `(${r.currency})` : ""}
          </h2>
          <ListaInset>
            {r.balances.map((b) => (
              <FilaInset key={b.user_id}>
                <div className="min-w-0">
                  <p className="truncate font-medium">{nombre(b.user_id)}</p>
                  <p className="text-xs text-muted-foreground">
                    puso {formatearMonto(b.puso, { moneda: r.currency })} · le tocaba{" "}
                    {formatearMonto(b.parte, { moneda: r.currency })}
                  </p>
                </div>
                <span
                  className={
                    b.neto > 0
                      ? "font-medium text-income"
                      : b.neto < 0
                        ? "font-medium text-expense"
                        : "font-medium text-muted-foreground"
                  }
                >
                  {b.neto > 0 ? "le deben " : b.neto < 0 ? "debe " : "al día"}
                  {b.neto !== 0 && formatearMonto(Math.abs(b.neto), { moneda: r.currency })}
                </span>
              </FilaInset>
            ))}
          </ListaInset>

          {/* Como saldar: cada sugerencia se puede registrar como pago */}
          {r.liquidaciones.length > 0 && (
            <div>
              <h3 className="mb-1 text-xs font-semibold text-muted-foreground">Cómo saldar</h3>
              <ListaInset>
                {r.liquidaciones.map((l, i) => (
                  <FilaInset key={i}>
                    <span className="flex min-w-0 items-center gap-2 text-sm">
                      <span className="truncate font-medium">{nombre(l.de)}</span>
                      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="truncate font-medium">{nombre(l.a)}</span>
                      <span className="tabular ml-1 shrink-0 text-muted-foreground">
                        {formatearMonto(l.monto, { moneda: r.currency })}
                      </span>
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setPagando({ de: l.de, a: l.a, monto: l.monto, currency: r.currency })
                      }
                    >
                      Saldar
                    </Button>
                  </FilaInset>
                ))}
              </ListaInset>
            </div>
          )}
        </div>
      ))}

      {/* Pagos ya registrados, con deshacer */}
      {pagos.length > 0 && (
        <div>
          <h3 className="mb-1 text-xs font-semibold text-muted-foreground">Pagos registrados</h3>
          <ListaInset>
            {pagos.map((p) => (
              <FilaInset key={p.id}>
                <div className="min-w-0">
                  <p className="flex min-w-0 items-center gap-2 text-sm">
                    <span className="truncate font-medium">{nombre(p.from_user_id)}</span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate font-medium">{nombre(p.to_user_id)}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatearMonto(p.amount, { moneda: p.currency })} · {formatearFechaCorta(p.occurred_at)}
                    {" · "}
                    {p.account_id ? "pago" : "saldado"}
                  </p>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Deshacer pago"
                  onClick={() => deshacer(p.id)}
                >
                  <Undo2 className="h-4 w-4" />
                </Button>
              </FilaInset>
            ))}
          </ListaInset>
        </div>
      )}

      <SaldarPago
        groupId={groupId}
        liquidacion={pagando}
        miId={miId}
        nombre={nombre}
        onClose={() => setPagando(null)}
      />
    </section>
  )
}
