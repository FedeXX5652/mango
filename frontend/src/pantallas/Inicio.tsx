import { useQuery } from "@powersync/react"
import { Wallet } from "lucide-react"
import { useMemo } from "react"
import { Link } from "react-router-dom"

import { Vacio } from "@/componentes/Vacio"
import { iconoCuenta } from "@/lib/cuentas"
import { type Direccion, formatearMonto, formatearSaldo } from "@/lib/dinero"
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

const SQL_RECIENTES = `
  SELECT t.id, t.kind, t.amount, t.currency, t.occurred_at, t.payee, c.name AS categoria
  FROM transactions t
  LEFT JOIN categories c ON c.id = t.category_id
  WHERE t.deleted_at IS NULL AND t.status = 'confirmed'
  ORDER BY t.occurred_at DESC
  LIMIT 6
`

function fechaCorta(iso: string): string {
  return new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "short" })
}

// Saldo por cuenta = opening + ingresos - gastos + transferencias entrantes
// - salientes (solo confirmadas). Se calcula en SQLite, sin tocar el servidor.
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

export function Inicio() {
  const { data: cuentas } = useQuery<SaldoCuenta>(SQL_SALDOS)
  const { data: recientes } = useQuery<MovReciente>(SQL_RECIENTES)

  // Patrimonio por moneda: no cuenta las off_budget ni las archivadas.
  const patrimonio = useMemo(() => {
    const porMoneda = new Map<string, number>()
    for (const c of cuentas) {
      if (c.off_budget || c.archived) continue
      porMoneda.set(c.currency, (porMoneda.get(c.currency) ?? 0) + c.balance)
    }
    return [...porMoneda.entries()].sort()
  }, [cuentas])

  const activas = cuentas.filter((c) => !c.archived)
  const archivadas = cuentas.filter((c) => c.archived)

  if (activas.length === 0 && archivadas.length === 0) {
    return (
      <div className="mx-auto max-w-3xl p-4">
        <Vacio
          icono={Wallet}
          titulo="Sin cuentas todavía"
          detalle="Creá tu primera cuenta para ver tu patrimonio y empezar a cargar movimientos."
          accion={{ to: "/cuentas", etiqueta: "Crear cuenta" }}
        />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4">
      <section className="rounded-xl bg-card p-5">
        <h2 className="text-sm font-medium text-muted-foreground">Patrimonio</h2>
        {patrimonio.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">Sin cuentas en el patrimonio.</p>
        ) : (
          <div className="mt-1 space-y-1">
            {patrimonio.map(([moneda, total]) => (
              <p key={moneda} className="tabular text-3xl font-semibold">
                {formatearSaldo(total, moneda)}
              </p>
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {activas.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground">Cuentas</h2>
            <div className="grid gap-3">
              {activas.map((c) => (
                <TarjetaCuenta key={c.id} cuenta={c} />
              ))}
            </div>
          </section>
        )}

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
            <ul className="divide-y divide-border rounded-lg border border-border bg-card px-4">
              {recientes.map((m) => (
                <li key={m.id}>
                  <Link
                    to={`/movimientos/${m.id}`}
                    className="flex items-center justify-between gap-3 py-3"
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
                      {formatearMonto(m.amount, { moneda: m.currency, direccion: DIR[m.kind] })}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {archivadas.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground">Archivadas</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {archivadas.map((c) => (
              <TarjetaCuenta key={c.id} cuenta={c} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function TarjetaCuenta({ cuenta }: { cuenta: SaldoCuenta }) {
  const Icono = iconoCuenta(cuenta.type)
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-4">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Icono className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="truncate font-medium">{cuenta.name}</p>
          <p className="text-xs text-muted-foreground">
            {cuenta.currency}
            {cuenta.off_budget ? " · fuera del patrimonio" : ""}
          </p>
        </div>
      </div>
      <span
        className={cn(
          "tabular font-semibold",
          cuenta.balance < 0 ? "text-expense" : "text-foreground",
        )}
      >
        {formatearSaldo(cuenta.balance, cuenta.currency)}
      </span>
    </div>
  )
}
