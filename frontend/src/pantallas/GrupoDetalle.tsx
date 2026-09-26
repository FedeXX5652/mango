import { useQuery } from "@powersync/react"
import { ArrowLeft } from "lucide-react"
import { useNavigate, useParams } from "react-router-dom"

import { CuentaConjunta } from "@/componentes/CuentaConjunta"
import { GrupoCategorias } from "@/componentes/GrupoCategorias"
import { Monto } from "@/componentes/Monto"
import { PresupuestoGrupo } from "@/componentes/PresupuestoGrupo"
import { ResumenGrupo } from "@/componentes/ResumenGrupo"
import { Vacio } from "@/componentes/Vacio"
import { Button } from "@/componentes/ui/button"
import { FilaInset, ListaInset } from "@/componentes/ui/listaInset"
import { Receipt } from "lucide-react"
import { iconoDe } from "@/lib/iconos"
import { formatearFechaCorta } from "@/lib/fecha"
import { usuarioActualId } from "@/lib/sesion"
import { cn } from "@/lib/utils"

// Actividad de un grupo: los movimientos COMPARTIDOS, de todos los miembros
// (fase 3b.2). Cada uno muestra categoria, monto, fecha y quien lo cargo; la
// cuenta y el medio de pago NO viajan (no estan ni en la base local).
//
// Esto NO son los balances: el gasto compartido de otro no se debita de tus
// cuentas. Los totales y el reparto del grupo son 3b.3.

interface FilaCompartida {
  id: string
  occurred_at: string
  amount: number
  currency: string
  payee: string | null
  kind: string
  categoria: string | null
  icono: string | null
  quien: string | null
  es_mio: number
}

const DIRECCION = { expense: "gasto", income: "ingreso", transfer: "neutro" } as const

export function GrupoDetalle() {
  const navigate = useNavigate()
  const { id = "" } = useParams()

  const { data: grupo } = useQuery<{ name: string; color: string | null }>(
    "SELECT name, color FROM groups WHERE id = ? AND deleted_at IS NULL",
    [id],
  )
  const miId = usuarioActualId() ?? ""

  const { data: filas } = useQuery<FilaCompartida>(
    `SELECT t.id, t.occurred_at, t.amount, t.currency, t.payee, t.kind,
            c.name AS categoria, c.icon AS icono,
            u.display_name AS quien,
            (t.owner_id = ?) AS es_mio
     FROM transactions t
     LEFT JOIN categories c ON c.id = t.category_id
     LEFT JOIN users u ON u.id = t.owner_id
     WHERE t.group_id = ? AND t.visibility = 'shared' AND t.deleted_at IS NULL
     ORDER BY t.occurred_at DESC`,
    [miId, id],
  )

  const nombre = grupo[0]?.name ?? "Grupo"
  const color = grupo[0]?.color ?? "#9CA3AF"

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <header className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate("/grupos")} aria-label="Volver">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <span
          className="h-3.5 w-3.5 shrink-0 rounded-full"
          style={{ backgroundColor: color }}
          aria-hidden
        />
        <h1 className="text-xl font-semibold">{nombre}</h1>
      </header>

      <ResumenGrupo groupId={id} />

      <PresupuestoGrupo groupId={id} />

      <CuentaConjunta groupId={id} />

      <GrupoCategorias groupId={id} />

      <h2 className="pt-2 text-sm font-semibold text-muted-foreground">Actividad compartida</h2>
      {filas.length === 0 ? (
        <Vacio
          icono={Receipt}
          titulo="Sin gastos compartidos"
          detalle="Cuando alguien marque un movimiento como compartido con este grupo, aparece acá."
        />
      ) : (
        <ListaInset>
          {filas.map((f) => {
            const Icono = iconoDe(f.icono)
            const titulo = f.payee || f.categoria || "—"
            const quien = f.es_mio ? "Vos" : (f.quien ?? "Otro")
            return (
              <FilaInset key={f.id}>
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted">
                    <Icono className="h-4 w-4 text-muted-foreground" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-medium">{titulo}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {quien} · {formatearFechaCorta(f.occurred_at)}
                      {f.categoria && f.payee ? ` · ${f.categoria}` : ""}
                    </p>
                  </div>
                </div>
                <Monto
                  centavos={f.amount}
                  moneda={f.currency}
                  direccion={DIRECCION[f.kind as keyof typeof DIRECCION] ?? "neutro"}
                  variante="lista"
                  className={cn(
                    "font-medium",
                    f.kind === "income" ? "text-income" : "text-expense",
                  )}
                />
              </FilaInset>
            )
          })}
        </ListaInset>
      )}
    </div>
  )
}
