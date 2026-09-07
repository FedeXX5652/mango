import { useQuery } from "@powersync/react"
import { Settings, Wallet } from "lucide-react"
import { useMemo } from "react"
import { Link } from "react-router-dom"

import { Monto } from "@/componentes/Monto"
import { TarjetaPatrimonio } from "@/componentes/TarjetaPatrimonio"
import { Vacio } from "@/componentes/Vacio"
import { useMonedaBase } from "@/hooks/monedaBase"
import { iconoCuenta } from "@/lib/cuentas"
import { type Direccion } from "@/lib/dinero"
import { ordenarMonedas } from "@/lib/monedas"
import type { SaldoMoneda } from "@/lib/patrimonio"
import { cn } from "@/lib/utils"

interface SaldoCuenta {
  id: string
  name: string
  type: string
  currency: string
  off_budget: number
  archived: number
  balance: number
}
interface MovReciente {
  id: string
  kind: "expense" | "income" | "transfer"
  amount: number
  currency: string
  occurred_at: string
  payee: string | null
  categoria: string | null
}

const DIR: Record<MovReciente["kind"], Direccion> = {
  expense: "gasto",
  income: "ingreso",
  transfer: "neutro",
}

// Topes del resumen: el detalle completo esta a un toque ("Ver todos/todas").
const MAX_RECIENTES = 5
const MAX_CUENTAS = 4

const SQL_SALDOS = `
  SELECT a.id, a.name, a.type, a.currency, a.off_budget, a.archived,
    a.opening_balance
    + COALESCE((SELECT SUM(amount) FROM transactions
        WHERE account_id = a.id AND kind='income' AND status='confirmed' AND deleted_at IS NULL), 0)
    - COALESCE((SELECT SUM(amount) FROM transactions
        WHERE account_id = a.id AND kind='expense' AND status='confirmed' AND deleted_at IS NULL), 0)
    + COALESCE((SELECT SUM(amount) FROM transactions
        WHERE transfer_account_id = a.id AND kind='transfer' AND status='confirmed' AND deleted_at IS NULL), 0)
    - COALESCE((SELECT SUM(amount) FROM transactions
        WHERE account_id = a.id AND kind='transfer' AND status='confirmed' AND deleted_at IS NULL), 0)
    AS balance
  FROM accounts a
  WHERE a.deleted_at IS NULL
  ORDER BY a.archived, a.sort_order, a.created_at
`

const SQL_RECIENTES = `
  SELECT t.id, t.kind, t.amount, t.currency, t.occurred_at, t.payee, c.name AS categoria
  FROM transactions t
  LEFT JOIN categories c ON c.id = t.category_id
  WHERE t.deleted_at IS NULL AND t.status = 'confirmed'
  ORDER BY t.occurred_at DESC
  LIMIT ${MAX_RECIENTES}
`

// Totales del mes en curso, para los tres datos de arriba. Se leen en UNA
// moneda (la base): sumar monedas distintas da un numero que no significa nada
// y convertir necesita cotizaciones (ver 0005). Lo que quede afuera se avisa.
const SQL_MES = `
  SELECT kind, SUM(amount) AS total FROM transactions
  WHERE kind IN ('income','expense') AND status = 'confirmed' AND deleted_at IS NULL
    AND currency = ? AND occurred_at >= ? AND occurred_at < ?
  GROUP BY kind
`

// Monedas distintas de la base con movimientos en el mes: no entran en los tres
// datos y hay que decirlo.
const SQL_OTRAS_MONEDAS = `
  SELECT DISTINCT currency FROM transactions
  WHERE kind IN ('income','expense') AND status = 'confirmed' AND deleted_at IS NULL
    AND currency <> ? AND occurred_at >= ? AND occurred_at < ?
`

function fechaCorta(iso: string): string {
  return new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "short" })
}

function Dato({
  etiqueta,
  centavos,
  clase,
}: {
  etiqueta: string
  centavos: number
  clase: string
}) {
  // Estos tres van SIN abreviar: son el resumen del mes y el numero exacto es
  // el dato. Por eso en movil van como tres filas de una tarjeta (un monto
  // completo no entra en un tercio de 390 px) y en escritorio como tres
  // tarjetas en fila, donde sobra ancho.
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-3 border-b border-border px-3 py-2.5 last:border-b-0",
        "lg:flex-col lg:items-start lg:gap-0 lg:rounded-xl lg:border lg:bg-card lg:p-3",
      )}
    >
      <p className="text-xs text-muted-foreground">{etiqueta}</p>
      <Monto centavos={centavos} className={cn("text-base font-semibold", clase)} />
    </div>
  )
}

export function Inicio() {
  const { data: cuentas } = useQuery<SaldoCuenta>(SQL_SALDOS)
  const { data: recientes } = useQuery<MovReciente>(SQL_RECIENTES)

  const rangoMes = useMemo(() => {
    const h = new Date()
    return [
      new Date(h.getFullYear(), h.getMonth(), 1).toISOString(),
      new Date(h.getFullYear(), h.getMonth() + 1, 1).toISOString(),
    ]
  }, [])
  const base = useMonedaBase()
  const { data: mesRows } = useQuery<{ kind: string; total: number }>(SQL_MES, [
    base,
    ...rangoMes,
  ])
  const { data: otrasRows } = useQuery<{ currency: string }>(SQL_OTRAS_MONEDAS, [
    base,
    ...rangoMes,
  ])
  const otrasMonedas = useMemo(
    () => ordenarMonedas(otrasRows.map((r) => r.currency), base).filter((c) => c !== base),
    [otrasRows, base],
  )
  const ingresos = mesRows.find((r) => r.kind === "income")?.total ?? 0
  const egresos = mesRows.find((r) => r.kind === "expense")?.total ?? 0
  const resultado = ingresos - egresos

  // Saldo por moneda de las cuentas que cuentan en el patrimonio. La tarjeta
  // decide si lo muestra unificado o separado.
  const patrimonio = useMemo<SaldoMoneda[]>(() => {
    const porMoneda = new Map<string, number>()
    for (const c of cuentas) {
      if (c.off_budget || c.archived) continue
      porMoneda.set(c.currency, (porMoneda.get(c.currency) ?? 0) + c.balance)
    }
    return [...porMoneda.entries()]
      .sort()
      .map(([moneda, saldo]) => ({ moneda, saldo }))
  }, [cuentas])

  const activas = cuentas.filter((c) => !c.archived)

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4">
      {/* Header movil: Ajustes vive aca (en escritorio esta en la barra lateral). */}
      <header className="flex items-center justify-between lg:hidden">
        <div className="flex items-center gap-2">
          <img src="/icons/svg/mango.svg" alt="" className="h-7 w-7" />
          <span className="text-lg font-semibold">Mango</span>
        </div>
        <Link
          to="/ajustes"
          aria-label="Ajustes"
          className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted"
        >
          <Settings className="h-5 w-5" />
        </Link>
      </header>

      {activas.length === 0 ? (
        <Vacio
          icono={Wallet}
          titulo="Sin cuentas todavía"
          detalle="Creá tu primera cuenta para ver tu patrimonio y empezar a cargar movimientos."
          accion={{ to: "/cuentas", etiqueta: "Crear cuenta" }}
        />
      ) : (
        <>
          <TarjetaPatrimonio saldos={patrimonio} base={base} />

          {/* Tres datos del mes en curso, cada uno con su token de color. */}
          <div className="overflow-hidden rounded-xl border border-border bg-card lg:grid lg:grid-cols-3 lg:gap-3 lg:overflow-visible lg:rounded-none lg:border-0 lg:bg-transparent">
            <Dato etiqueta="Ingresos" centavos={ingresos} clase="text-income" />
            <Dato etiqueta="Egresos" centavos={egresos} clase="text-expense" />
            <Dato
              etiqueta="Resultado"
              centavos={resultado}
              clase={resultado < 0 ? "text-expense" : "text-income"}
            />
          </div>
          {otrasMonedas.length > 0 && (
            <p className="-mt-1 px-1 text-xs text-muted-foreground">
              Solo en {base}. Este mes también hay movimientos en {otrasMonedas.join(", ")}:{" "}
              <Link to="/estadisticas" className="text-primary underline-offset-2 hover:underline">
                verlos en Estadísticas
              </Link>
              .
            </p>
          )}

          {/* Cuentas: bloque 2x2 con las primeras segun el orden de Ajustes. */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-muted-foreground">Cuentas</h2>
              {activas.length > MAX_CUENTAS && (
                <Link to="/cuentas" className="text-xs text-primary hover:underline">
                  Ver todas ({activas.length})
                </Link>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              {activas.slice(0, MAX_CUENTAS).map((c) => {
                const Icono = iconoCuenta(c.type)
                return (
                  <div key={c.id} className="rounded-xl border border-border bg-card p-3">
                    <div className="mb-2 flex items-center gap-2">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                        <Icono className="h-4 w-4" aria-hidden />
                      </span>
                      <span className="truncate text-sm text-muted-foreground">{c.name}</span>
                    </div>
                    {/* Saldo completo, sin abreviar (ver 0006). En movil el
                        monto largo baja un punto de tamano antes que perder
                        digitos. */}
                    <Monto
                      centavos={c.balance}
                      moneda={c.currency}
                      className={cn(
                        "block text-base font-semibold sm:text-lg",
                        c.balance < 0 && "text-expense",
                      )}
                    />
                  </div>
                )
              })}
            </div>
          </section>

          {/* Ultimos movimientos */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-muted-foreground">Últimos movimientos</h2>
              {recientes.length > 0 && (
                <Link to="/movimientos" className="text-xs text-primary hover:underline">
                  Ver todos
                </Link>
              )}
            </div>
            {recientes.length === 0 ? (
              <p className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
                Todavía no hay movimientos.
              </p>
            ) : (
              <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
                {recientes.map((m) => (
                  <li key={m.id}>
                    <Link
                      to={`/movimientos/${m.id}`}
                      className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-muted"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {m.payee ||
                            m.categoria ||
                            (m.kind === "transfer" ? "Transferencia" : "—")}
                        </p>
                        <p className="text-xs text-muted-foreground">{fechaCorta(m.occurred_at)}</p>
                      </div>
                      <span
                        className={cn(
                          "tabular shrink-0 text-sm font-medium",
                          m.kind === "expense"
                            ? "text-expense"
                            : m.kind === "income"
                              ? "text-income"
                              : "text-foreground",
                        )}
                      >
                        <Monto
                          centavos={m.amount}
                          moneda={m.currency}
                          direccion={DIR[m.kind]}
                          variante="lista"
                        />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  )
}
