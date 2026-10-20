import { usePowerSync, useQuery } from "@powersync/react"
import { Wallet } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { Link } from "react-router-dom"

import { SelectorEntidad } from "@/componentes/SelectorEntidad"
import { Button } from "@/componentes/ui/button"
import { Input } from "@/componentes/ui/input"
import { FilaInset, ListaInset } from "@/componentes/ui/listaInset"
import { cotizacionDe } from "@/lib/conversion"
import { aCentavos, formatearMonto } from "@/lib/dinero"

// Lo que puse en un gasto que cargó otro (0032): un movimiento mío, pendiente
// hasta que digo de qué cuenta salió. "Sí, la pagué" es lo principal, con la
// última cuenta que usé ya elegida; "No la pagué" va abajo, como texto, y se
// puede deshacer: el aviso a quien lo cargó sale recién un rato después.

export interface PagoMio {
  id: string
  amount: number
  currency: string
  payee: string | null
  status: string
  account_id: string | null
  // Del gasto: quién lo cargó, el total y dónde verlo.
  autor: string | null
  total: number | null
  group_id: string | null
  paid_for_id: string
}

export const SQL_PAGOS_MIOS = `
  SELECT t.id, t.amount, t.currency, COALESCE(t.payee, c.name) AS payee, t.status,
         t.account_id, t.paid_for_id, u.display_name AS autor, g.amount AS total, g.group_id
  FROM transactions t
  LEFT JOIN categories c ON c.id = t.category_id
  LEFT JOIN group_transactions g ON g.id = t.paid_for_id
  LEFT JOIN member_profiles u ON u.id = g.owner_id
  WHERE t.paid_for_id IS NOT NULL AND t.deleted_at IS NULL`

// El rato para deshacer "No la pagué" (el servidor espera lo mismo, 0032).
const DESHACER_MS = 30_000

interface Cuenta {
  id: string
  name: string
  currency: string
}

function useCuentas(): { cuentas: Cuenta[]; ultima: string } {
  const { data: cuentas } = useQuery<Cuenta>(
    "SELECT id, name, currency FROM accounts WHERE owner_id IS NOT NULL AND deleted_at IS NULL AND archived = 0 ORDER BY sort_order, name",
  )
  // La última cuenta con la que pagué algo: la más probable.
  const { data: ultimas } = useQuery<{ account_id: string }>(
    `SELECT t.account_id FROM transactions t JOIN accounts a ON a.id = t.account_id
     WHERE t.kind = 'expense' AND t.status = 'confirmed' AND t.deleted_at IS NULL
       AND a.owner_id IS NOT NULL AND a.deleted_at IS NULL AND a.archived = 0
     ORDER BY t.occurred_at DESC LIMIT 1`,
  )
  return { cuentas, ultima: ultimas[0]?.account_id ?? cuentas[0]?.id ?? "" }
}

// La tarjeta del Inicio: lo que falta confirmar.
export function PagosPorConfirmar() {
  const { data: pagos } = useQuery<PagoMio>(
    `${SQL_PAGOS_MIOS} AND t.status IN ('pending', 'rejected') ORDER BY t.occurred_at DESC`,
  )
  // Los que acabo de rechazar siguen a la vista el rato para deshacer.
  const [recientes, setRecientes] = useState<string[]>([])
  const visibles = pagos.filter((p) => p.status === "pending" || recientes.includes(p.id))
  if (visibles.length === 0) return null
  const pendientes = visibles.filter((p) => p.status === "pending").length

  return (
    <section className="rounded-xl border border-primary/30 bg-primary/5 p-4">
      <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <Wallet className="h-4 w-4 text-primary" aria-hidden />
        Pagos por confirmar{pendientes > 0 ? ` (${pendientes})` : ""}
      </h2>
      <ListaInset>
        {visibles.map((p) => (
          <FilaInset key={p.id}>
            <TuParte
              pago={p}
              conEnlace
              onRechazado={(id) => {
                setRecientes((r) => [...r, id])
                setTimeout(() => setRecientes((r) => r.filter((x) => x !== id)), DESHACER_MS)
              }}
            />
          </FilaInset>
        ))}
      </ListaInset>
    </section>
  )
}

// Mi parte de un gasto: confirmar, decir que no, o cambiar lo que dije.
export function TuParte({
  pago,
  conEnlace,
  onRechazado,
}: {
  pago: PagoMio
  conEnlace?: boolean
  onRechazado?: (id: string) => void
}) {
  const db = usePowerSync()
  const { cuentas, ultima } = useCuentas()
  const [cuentaElegida, setCuentaElegida] = useState("")
  const cuentaId = cuentaElegida || pago.account_id || ultima
  const cuenta = cuentas.find((c) => c.id === cuentaId)
  const difieren = Boolean(cuenta) && cuenta!.currency !== pago.currency
  const [debitado, setDebitado] = useState("")
  const [cambiando, setCambiando] = useState(false)
  const [deshacible, setDeshacible] = useState(false)
  const [error, setError] = useState("")
  const reloj = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => void (reloj.current && clearTimeout(reloj.current)), [])

  async function confirmar() {
    setError("")
    if (!cuenta) return setError("Elegí la cuenta")
    let montoCuenta: number | null = null
    let cotizacion: string | null = null
    if (difieren) {
      montoCuenta = aCentavos(debitado, cuenta.currency)
      if (!montoCuenta || montoCuenta <= 0)
        return setError(`Poné cuánto salió de la cuenta, en ${cuenta.currency}`)
      cotizacion = cotizacionDe(pago.amount, pago.currency, montoCuenta, cuenta.currency)
    }
    await db.execute(
      `UPDATE transactions SET account_id = ?, amount_account = ?, exchange_rate = ?,
         status = 'confirmed' WHERE id = ?`,
      [cuenta.id, montoCuenta, cotizacion, pago.id],
    )
    setCambiando(false)
  }

  async function noLaPague() {
    await db.execute("UPDATE transactions SET status = 'rejected' WHERE id = ?", [pago.id])
    setCambiando(false)
    setDeshacible(true)
    onRechazado?.(pago.id)
    reloj.current = setTimeout(() => setDeshacible(false), DESHACER_MS)
  }

  async function deshacer() {
    await db.execute("UPDATE transactions SET status = 'pending' WHERE id = ?", [pago.id])
    setDeshacible(false)
  }

  const monto = formatearMonto(pago.amount, { moneda: pago.currency })
  const donde = pago.payee ?? "un gasto"
  const titulo = (
    <p className="text-sm">
      <span className="font-medium">{donde}</span>
      <span className="text-muted-foreground">
        {pago.autor ? ` · lo cargó ${pago.autor}` : ""}
        {pago.total !== null ? ` · ${formatearMonto(pago.total, { moneda: pago.currency })}` : ""}
      </span>
    </p>
  )

  if (pago.status === "rejected" && !cambiando) {
    return (
      <div className="min-w-0 flex-1 space-y-1">
        {conEnlace && titulo}
        {deshacible ? (
          <p role="status" className="text-sm">
            Le vamos a avisar en un rato que no pusiste {monto}.{" "}
            <button type="button" className="font-medium text-enlace underline" onClick={deshacer}>
              Deshacer
            </button>
          </p>
        ) : (
          <p className="text-sm">
            Dijiste que no pusiste {monto}.{" "}
            <button
              type="button"
              className="font-medium text-enlace underline"
              onClick={() => setCambiando(true)}
            >
              Cambiar
            </button>
          </p>
        )}
      </div>
    )
  }

  if (pago.status === "confirmed" && !cambiando) {
    return (
      <div className="min-w-0 flex-1">
        {conEnlace && titulo}
        <p className="text-sm">
          Pusiste {monto}
          {cuentas.find((c) => c.id === pago.account_id)
            ? ` con ${cuentas.find((c) => c.id === pago.account_id)!.name}`
            : ""}
          .{" "}
          <button
            type="button"
            className="font-medium text-enlace underline"
            onClick={() => setCambiando(true)}
          >
            Cambiar
          </button>
        </p>
      </div>
    )
  }

  return (
    <div className="min-w-0 flex-1 space-y-2">
      {conEnlace && titulo}
      <p className="text-sm">
        Pusiste <span className="tabular font-medium">{monto}</span>. ¿De qué cuenta salió?
      </p>
      <SelectorEntidad
        titulo="¿De qué cuenta salió?"
        placeholder="Cuenta"
        opciones={cuentas.map((c) => ({ id: c.id, nombre: c.name, detalle: c.currency }))}
        valor={cuentaId}
        onCambio={setCuentaElegida}
      />
      {difieren && (
        <Input
          value={debitado}
          onChange={(e) => setDebitado(e.target.value)}
          inputMode="decimal"
          aria-label={`Cuánto salió de la cuenta, en ${cuenta!.currency}`}
          placeholder={`Cuánto salió, en ${cuenta!.currency}`}
          className="tabular"
        />
      )}
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      <Button size="sm" className="w-full" onClick={confirmar}>
        {cuenta ? `La pagué con ${cuenta.name}` : "La pagué"}
      </Button>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          className="min-h-11 text-sm text-muted-foreground underline"
          onClick={noLaPague}
        >
          No la pagué
        </button>
        {conEnlace && pago.group_id && (
          <Link
            to={`/grupos/${pago.group_id}/movimientos/${pago.paid_for_id}`}
            className="min-h-11 content-center text-sm text-enlace underline"
          >
            Ver el gasto
          </Link>
        )}
      </div>
    </div>
  )
}
