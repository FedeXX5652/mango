import { useQuery, useStatus } from "@powersync/react"

import { type Direccion, formatearMonto } from "@/lib/dinero"
import { cn } from "@/lib/utils"

interface Fila {
  id: string
  kind: "expense" | "income" | "transfer"
  amount: number
  currency: string
  occurred_at: string
  payee: string | null
  status: string
  categoria: string | null
  cuenta: string | null
}

const DIRECCION: Record<Fila["kind"], Direccion> = {
  expense: "gasto",
  income: "ingreso",
  transfer: "neutro",
}
const COLOR: Record<Fila["kind"], string> = {
  expense: "text-expense",
  income: "text-income",
  transfer: "text-transfer",
}

function fecha(iso: string): string {
  return new Date(iso).toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function EstadoSync() {
  const status = useStatus()
  const texto = !status.connected
    ? "Sin conexión"
    : status.dataFlowStatus.downloading || status.dataFlowStatus.uploading
      ? "Sincronizando…"
      : "Al día"
  const color = !status.connected ? "text-muted-foreground" : "text-income"
  return <span className={cn("text-xs", color)}>{texto}</span>
}

export function Movimientos() {
  const { data: filas } = useQuery<Fila>(
    `SELECT t.id, t.kind, t.amount, t.currency, t.occurred_at, t.payee, t.status,
            c.name AS categoria, a.name AS cuenta
     FROM transactions t
     LEFT JOIN categories c ON c.id = t.category_id
     LEFT JOIN accounts a ON a.id = t.account_id
     WHERE t.deleted_at IS NULL
     ORDER BY t.occurred_at DESC
     LIMIT 100`,
  )

  return (
    <div className="mx-auto max-w-2xl p-4">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Movimientos</h1>
        <EstadoSync />
      </header>

      {filas.length === 0 ? (
        <p className="p-8 text-center text-sm text-muted-foreground">
          Todavía no hay movimientos. Cargá uno con el botón +.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {filas.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {f.payee || f.categoria || (f.kind === "transfer" ? "Transferencia" : "—")}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {f.cuenta} · {fecha(f.occurred_at)}
                  {f.status === "pending" && " · pendiente"}
                </p>
              </div>
              <span className={cn("tabular font-medium", COLOR[f.kind])}>
                {formatearMonto(f.amount, { moneda: f.currency, direccion: DIRECCION[f.kind] })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
