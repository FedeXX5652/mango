import { useQuery } from "@powersync/react"
import { useMemo } from "react"

import { formatearSaldo } from "@/lib/dinero"
import { cn } from "@/lib/utils"

interface SaldoCuenta {
  id: string
  name: string
  currency: string
  off_budget: number
  archived: number
  balance: number
}

// Saldo por cuenta = opening + ingresos - gastos + transferencias entrantes
// - salientes (solo confirmadas). Se calcula en SQLite, sin tocar el servidor.
const SQL_SALDOS = `
  SELECT a.id, a.name, a.currency, a.off_budget, a.archived,
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

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4">
      <section className="rounded-xl bg-card p-5">
        <h2 className="text-sm font-medium text-muted-foreground">Patrimonio</h2>
        {patrimonio.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">Sin cuentas todavía.</p>
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

      {activas.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground">Cuentas</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {activas.map((c) => (
              <TarjetaCuenta key={c.id} cuenta={c} />
            ))}
          </div>
        </section>
      )}

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
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-4">
      <div className="min-w-0">
        <p className="truncate font-medium">{cuenta.name}</p>
        <p className="text-xs text-muted-foreground">
          {cuenta.currency}
          {cuenta.off_budget ? " · fuera del patrimonio" : ""}
        </p>
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
