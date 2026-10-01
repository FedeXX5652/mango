import { useQuery } from "@powersync/react"
import { ArrowLeft } from "lucide-react"
import { useParams } from "react-router-dom"

import { Monto } from "@/componentes/Monto"
import { Button } from "@/componentes/ui/button"
import { FilaInset, ListaInset } from "@/componentes/ui/listaInset"
import { useGrupo } from "@/hooks/useGrupo"
import { useVolver } from "@/hooks/useVolver"
import { formatearMonto } from "@/lib/dinero"
import { formatearFechaCorta } from "@/lib/fecha"
import { parteEnGasto } from "@/lib/grupo"
import { TX_GRUPO } from "@/lib/lente"
import { DetalleMovimiento } from "@/pantallas/DetalleMovimiento"
import { useGrupoDeRuta } from "@/hooks/useEspacio"
import { CargandoGrupo, GrupoNoEncontrado } from "@/pantallas/grupo/comun"

interface FilaGasto {
  id: string
  owner_id: string
  amount: number
  currency: string
  category_id: string | null
  payee: string | null
  occurred_at: string
  paid_from_group?: number
}

// Un gasto del grupo (0026). Si lo cargue yo, es el detalle de siempre
// (editable). Si lo cargo otro, se ve en SOLO LECTURA: solo lo edita quien lo
// cargo, que es la regla del servidor y la que protege lo privado de cada uno
// (su cuenta ni siquiera viaja, 0021).
export function DetalleGastoGrupo() {
  const { id: txId = "" } = useParams()
  const { id, grupo, cargando } = useGrupoDeRuta()
  const datos = useGrupo(id)
  const volver = useVolver(`/grupos/${id}/movimientos`)
  const { data, isLoading } = useQuery<FilaGasto>(
    `SELECT id, owner_id, amount, currency, category_id, payee, occurred_at, paid_from_group
     FROM ${TX_GRUPO} t WHERE t.id = ? AND t.group_id = ? AND t.deleted_at IS NULL`,
    [txId, id],
  )
  const tx = data[0]

  if (cargando || isLoading) return <CargandoGrupo />
  if (!grupo) return <GrupoNoEncontrado />
  if (tx && tx.owner_id === datos.miId) return <DetalleMovimiento />

  const cat = tx?.category_id ? datos.categoria.get(tx.category_id) : undefined
  const splits = tx ? (datos.splitsDe.get(tx.id) ?? []) : []

  return (
    <div className="mx-auto max-w-md space-y-4 p-4">
      <header className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={volver} aria-label="Volver">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="min-w-0 truncate text-2xl font-semibold">
          {tx ? tx.payee || cat?.name || "Gasto" : "Gasto"}
        </h1>
      </header>

      {!tx ? (
        <p className="text-sm text-muted-foreground">Este gasto ya no está en el grupo.</p>
      ) : (
        <>
          <Monto
            centavos={tx.amount}
            moneda={tx.currency}
            direccion="gasto"
            className="block text-3xl font-semibold text-expense"
          />
          <ListaInset>
            <Dato etiqueta="Pagó">
              {tx.paid_from_group ? "La cuenta conjunta" : datos.nombre(tx.owner_id)}
            </Dato>
            <Dato etiqueta="Fecha">{formatearFechaCorta(tx.occurred_at)}</Dato>
            <Dato etiqueta="Categoría">{cat?.name ?? "Sin categoría"}</Dato>
            {tx.payee && <Dato etiqueta="Comercio">{tx.payee}</Dato>}
          </ListaInset>

          {!tx.paid_from_group && (
            <section className="space-y-1">
              <h2 className="px-1 text-xs font-medium text-muted-foreground">
                Reparto {splits.length > 0 ? "" : "(partes iguales)"}
              </h2>
              <ListaInset>
                {datos.miembros.map((m) => (
                  <Dato key={m.user_id} etiqueta={datos.nombre(m.user_id)}>
                    {formatearMonto(parteEnGasto(tx, splits, datos.miembros, m.user_id) ?? 0, {
                      moneda: tx.currency,
                    })}
                  </Dato>
                ))}
              </ListaInset>
            </section>
          )}

          <p className="text-sm text-muted-foreground">
            Lo cargó {datos.nombre(tx.owner_id)}: solo esa persona lo puede editar.
          </p>
        </>
      )}
    </div>
  )
}

function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <FilaInset>
      <span className="text-sm text-muted-foreground">{etiqueta}</span>
      <span className="tabular min-w-0 truncate text-right text-sm font-medium">{children}</span>
    </FilaInset>
  )
}
