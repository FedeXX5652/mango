import { usePowerSync } from "@powersync/react"
import { ArrowRight, HandCoins } from "lucide-react"
import { useState } from "react"
import { Link } from "react-router-dom"

import { Monto } from "@/componentes/Monto"
import { Button } from "@/componentes/ui/button"
import { Confirmar } from "@/componentes/ui/confirmar"
import { Hoja } from "@/componentes/ui/hoja"
import type { CategoriaGrupo, ItemHistoria, PagoGrupo } from "@/hooks/useGrupo"
import { formatearMonto } from "@/lib/dinero"
import { formatearFechaCorta } from "@/lib/fecha"
import { type MiembroGrupo, type SplitRow, parteEnGasto } from "@/lib/grupo"
import { iconoDe } from "@/lib/iconos"

// Una fila de la historia de un grupo (0026): un gasto o un pago entre miembros.
// La usan el Inicio del grupo (lo ultimo) y Movimientos; la lista sale de
// `armarHistoria` (hooks/useGrupo).

const FILA =
  "flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"

export function FilaHistoria({
  item,
  groupId,
  miId,
  miembros,
  splitsDe,
  categoria,
  nombre,
  onPago,
  conFecha = true,
}: {
  item: ItemHistoria
  groupId: string
  miId: string
  miembros: MiembroGrupo[]
  splitsDe: Map<string, SplitRow[]>
  categoria: Map<string, CategoriaGrupo>
  nombre: (userId: string) => string
  onPago: (p: PagoGrupo) => void
  // En Movimientos la fecha ya esta en el encabezado del dia: repetirla cortaba
  // el "tu parte" en 390 px.
  conFecha?: boolean
}) {
  if (item.tipo === "pago") {
    const p = item.pago
    return (
      <button type="button" className={FILA} onClick={() => onPago(p)}>
        <span className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted">
            <HandCoins className="h-4 w-4 text-muted-foreground" aria-hidden />
          </span>
          <span className="min-w-0">
            <span className="flex min-w-0 items-center gap-1.5 font-medium">
              <span className="truncate">{nombre(p.from_user_id)}</span>
              <ArrowRight
                className="h-4 w-4 shrink-0 text-muted-foreground"
                aria-label="le pagó a"
              />
              <span className="truncate">{nombre(p.to_user_id)}</span>
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              {esPagoReal(p) ? "Pago" : "Saldado"}
              {conFecha && ` · ${formatearFechaCorta(p.occurred_at)}`}
            </span>
          </span>
        </span>
        <Monto centavos={p.amount} moneda={p.currency} variante="lista" className="font-medium" />
      </button>
    )
  }

  const g = item.gasto
  const cat = g.category_id ? categoria.get(g.category_id) : undefined
  // `iconoDe` busca en un Map estatico, no crea un componente (ver lib/iconos).
  const Icono = iconoDe(cat?.icon ?? null)
  const parte = parteEnGasto(g, splitsDe.get(g.id) ?? [], miembros, miId)
  const quien = g.paid_from_group ? "Cuenta conjunta" : `Pagó ${nombre(g.owner_id)}`
  return (
    <Link to={`/grupos/${groupId}/movimientos/${g.id}`} className={FILA}>
      <span className="flex min-w-0 items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted">
          {/* eslint-disable-next-line react-hooks/static-components */}
          <Icono className="h-4 w-4 text-muted-foreground" aria-hidden />
        </span>
        <span className="min-w-0">
          <span className="block truncate font-medium">{g.payee || cat?.name || "Gasto"}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {quien}
            {parte !== null && ` · tu parte ${formatearMonto(parte, { moneda: g.currency })}`}
            {conFecha && ` · ${formatearFechaCorta(g.occurred_at)}`}
          </span>
        </span>
      </span>
      <Monto
        centavos={g.amount}
        moneda={g.currency}
        direccion="gasto"
        variante="lista"
        className="font-medium text-expense"
      />
    </Link>
  )
}

// Un pago con plata (tuvo cuenta) o un "saldado" (por fuera, 0017).
function esPagoReal(p: PagoGrupo): boolean {
  return Boolean(p.account_id || p.pago_real)
}

// Detalle de un pago, con "Deshacer". Cualquier miembro lo puede deshacer (0017):
// es reversible y queda registrado, pero se confirma antes.
export function HojaPago({
  pago,
  nombre,
  onClose,
}: {
  pago: PagoGrupo | null
  nombre: (userId: string) => string
  onClose: () => void
}) {
  const db = usePowerSync()
  const [confirmar, setConfirmar] = useState(false)

  return (
    <>
      <Hoja abierta={pago !== null} onOpenChange={(v) => !v && onClose()} titulo="Pago">
        {pago && (
          <div className="space-y-4">
            <div>
              <p className="flex items-center gap-2 text-lg font-semibold">
                {nombre(pago.from_user_id)}
                <ArrowRight className="h-5 w-5 text-muted-foreground" aria-label="le pagó a" />
                {nombre(pago.to_user_id)}
              </p>
              <p className="tabular text-2xl font-semibold">
                {formatearMonto(pago.amount, { moneda: pago.currency })}
              </p>
              <p className="text-sm text-muted-foreground">
                {esPagoReal(pago) ? "Pago con plata" : "Marcado como saldado"} ·{" "}
                {formatearFechaCorta(pago.occurred_at)}
              </p>
            </div>
            <Button
              variant="outline"
              className="w-full text-destructive"
              onClick={() => setConfirmar(true)}
            >
              Deshacer pago
            </Button>
          </div>
        )}
      </Hoja>
      <Confirmar
        abierta={confirmar}
        onOpenChange={setConfirmar}
        titulo="Deshacer pago"
        detalle="La deuda vuelve a figurar en el balance. Si el cobro ya se había confirmado, queda en la cuenta de quien cobró y se le avisa."
        etiqueta="Deshacer"
        destructivo
        onConfirmar={async () => {
          if (pago) await db.execute("DELETE FROM settlements WHERE id = ?", [pago.id])
          setConfirmar(false)
          onClose()
        }}
      />
    </>
  )
}
