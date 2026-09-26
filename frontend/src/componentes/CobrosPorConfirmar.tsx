import { usePowerSync, useQuery } from "@powersync/react"
import { HandCoins } from "lucide-react"
import { useState } from "react"

import { SelectorCategoria } from "@/componentes/SelectorCategoria"
import { SelectorEntidad } from "@/componentes/SelectorEntidad"
import { Button } from "@/componentes/ui/button"
import { FilaInset, ListaInset } from "@/componentes/ui/listaInset"
import { formatearMonto } from "@/lib/dinero"

// Cobros por confirmar (fase 3b, ver 0018): ingresos PENDIENTES que genero un
// pago de deuda de otro miembro ("Pago de X"). El acreedor elige a que cuenta
// entro y con que categoria, y confirma: recien ahi entra a su saldo.

interface Cobro {
  id: string
  amount: number
  currency: string
  payee: string | null
}

export function CobrosPorConfirmar() {
  const db = usePowerSync()
  const { data: cobros } = useQuery<Cobro>(
    `SELECT id, amount, currency, payee FROM transactions
     WHERE status = 'pending' AND kind = 'income' AND settlement_id IS NOT NULL
       AND deleted_at IS NULL ORDER BY occurred_at DESC`,
  )
  const { data: cuentas } = useQuery<{ id: string; name: string; currency: string }>(
    "SELECT id, name, currency FROM accounts WHERE owner_id IS NOT NULL AND deleted_at IS NULL AND archived = 0 ORDER BY sort_order, name",
  )
  const { data: categorias } = useQuery<{
    id: string
    name: string
    parent_id: string | null
    icon: string | null
  }>(
    "SELECT id, name, parent_id, icon FROM categories WHERE kind = 'income' AND group_id IS NULL AND deleted_at IS NULL AND archived = 0",
  )

  if (cobros.length === 0) return null

  return (
    <section className="rounded-xl border border-primary/30 bg-primary/5 p-4">
      <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <HandCoins className="h-4 w-4 text-primary" />
        Cobros por confirmar ({cobros.length})
      </h2>
      <ListaInset>
        {cobros.map((c) => (
          <Fila key={c.id} cobro={c} cuentas={cuentas} categorias={categorias} db={db} />
        ))}
      </ListaInset>
    </section>
  )
}

function Fila({
  cobro,
  cuentas,
  categorias,
  db,
}: {
  cobro: Cobro
  cuentas: { id: string; name: string; currency: string }[]
  categorias: { id: string; name: string; parent_id: string | null; icon: string | null }[]
  db: ReturnType<typeof usePowerSync>
}) {
  const [cuentaId, setCuentaId] = useState("")
  const [categoriaId, setCategoriaId] = useState("")
  const [error, setError] = useState("")

  async function confirmar() {
    if (!cuentaId) return setError("Elegí la cuenta")
    if (!categoriaId) return setError("Elegí la categoría")
    // Al confirmar deja de ser pendiente y entra al saldo de esa cuenta.
    await db.execute(
      "UPDATE transactions SET account_id = ?, category_id = ?, status = 'confirmed' WHERE id = ?",
      [cuentaId, categoriaId, cobro.id],
    )
  }

  return (
    <FilaInset>
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate font-medium">{cobro.payee ?? "Pago recibido"}</span>
          <span className="tabular shrink-0 font-medium text-income">
            + {formatearMonto(cobro.amount, { moneda: cobro.currency })}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <SelectorEntidad
            titulo="Cuenta"
            placeholder="¿A qué cuenta entró?"
            opciones={cuentas.map((c) => ({ id: c.id, nombre: c.name, detalle: c.currency }))}
            valor={cuentaId}
            onCambio={setCuentaId}
          />
          <SelectorCategoria
            categorias={categorias}
            valor={categoriaId}
            onCambio={setCategoriaId}
            placeholder="Categoría"
          />
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
        <Button size="sm" className="w-full" onClick={confirmar}>
          Confirmar cobro
        </Button>
      </div>
    </FilaInset>
  )
}
