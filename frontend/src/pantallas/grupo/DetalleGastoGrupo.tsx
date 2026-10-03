import { useQuery } from "@powersync/react"
import { useParams } from "react-router-dom"

import { BotonSalir } from "@/componentes/BotonSalir"
import { Monto } from "@/componentes/Monto"
import { FilaInset, ListaInset } from "@/componentes/ui/listaInset"
import { useGrupo } from "@/hooks/useGrupo"
import { usePanel } from "@/hooks/usePanel"
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
  kind: "expense" | "income" | "transfer"
  // Si es un aporte a (o retiro de) la conjunta: su nombre y hacia donde fue.
  cuenta_conjunta: string | null
  sentido: "entra" | "sale"
}

// Un movimiento del grupo (0026): un gasto compartido o un aporte a la cuenta
// conjunta. Si lo cargue yo, es el detalle de siempre (editable). Si lo cargo
// otro, se ve en SOLO LECTURA: solo lo edita quien lo cargo, que es la regla del
// servidor y la que protege lo privado de cada uno (su cuenta ni siquiera
// viaja, 0021).
export function DetalleGastoGrupo() {
  const { id: txId = "" } = useParams()
  const { id, grupo, cargando } = useGrupoDeRuta()
  const datos = useGrupo(id)
  const volverDePantalla = useVolver(`/grupos/${id}/movimientos`)
  const volver = usePanel()?.cerrar ?? volverDePantalla
  const { data, isLoading } = useQuery<FilaGasto>(
    `SELECT t.id, t.owner_id, t.kind, t.amount, t.currency, t.category_id, t.payee, t.occurred_at,
            t.paid_from_group, c.name AS cuenta_conjunta,
            CASE WHEN c.id = t.transfer_account_id THEN 'entra' ELSE 'sale' END AS sentido
     FROM ${TX_GRUPO} t
     LEFT JOIN accounts c ON c.group_id = ? AND t.kind = 'transfer'
       AND c.id IN (t.account_id, t.transfer_account_id)
     WHERE t.id = ? AND t.deleted_at IS NULL AND (t.group_id = ? OR c.id IS NOT NULL)`,
    [id, txId, id],
  )
  const tx = data[0]

  if (cargando || isLoading) return <CargandoGrupo />
  if (!grupo) return <GrupoNoEncontrado />
  if (tx && tx.owner_id === datos.miId) return <DetalleMovimiento />

  if (tx?.kind === "transfer") return <AporteAjeno tx={tx} volver={volver} nombre={datos.nombre} />

  const cat = tx?.category_id ? datos.categoria.get(tx.category_id) : undefined
  const splits = tx ? (datos.splitsDe.get(tx.id) ?? []) : []

  return (
    <div className="mx-auto max-w-md space-y-4 p-4">
      <header className="flex items-center gap-2">
        <BotonSalir volver={volver} />
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

// El aporte de otro miembro a la conjunta: quien, cuanto, cuando y a que cuenta.
// De que cuenta personal salio no viaja (sync-config, lente b).
function AporteAjeno({
  tx,
  volver,
  nombre,
}: {
  tx: FilaGasto
  volver: () => void
  nombre: (userId: string) => string
}) {
  const entra = tx.sentido === "entra"
  return (
    <div className="mx-auto max-w-md space-y-4 p-4">
      <header className="flex items-center gap-2">
        <BotonSalir volver={volver} />
        <h1 className="min-w-0 truncate text-2xl font-semibold">
          {entra ? "Aporte a la conjunta" : "Retiro de la conjunta"}
        </h1>
      </header>
      <Monto centavos={tx.amount} moneda={tx.currency} className="block text-3xl font-semibold" />
      <ListaInset>
        <Dato etiqueta={entra ? "Puso" : "Sacó"}>{nombre(tx.owner_id)}</Dato>
        <Dato etiqueta="Cuenta">{tx.cuenta_conjunta ?? "Conjunta"}</Dato>
        <Dato etiqueta="Fecha">{formatearFechaCorta(tx.occurred_at)}</Dato>
      </ListaInset>
      <p className="text-sm text-muted-foreground">
        Lo cargó {nombre(tx.owner_id)}: solo esa persona lo puede editar.
      </p>
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
