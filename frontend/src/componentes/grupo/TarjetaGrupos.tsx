import { useQuery } from "@powersync/react"
import { ChevronRight } from "lucide-react"
import { Link } from "react-router-dom"

import { PuntoEspacio } from "@/componentes/PuntoEspacio"
import { useGrupo } from "@/hooks/useGrupo"
import { rutaEspacio } from "@/lib/espacios"
import { resumenMio } from "@/lib/grupo"
import { SIN_COLOR } from "@/lib/paleta"

// Los grupos en el Inicio personal (0026): una fila por grupo con como quedo yo
// ("Casa: Beto te debe $X ›"). Es lo que la pestaña Grupos dejaba a un toque:
// sin esto, saber si uno debe algo pedia entrar a cada grupo.

interface GrupoFila {
  id: string
  name: string
  color: string | null
}

export function TarjetaGrupos() {
  const { data: grupos } = useQuery<GrupoFila>(
    "SELECT id, name, color FROM groups WHERE deleted_at IS NULL ORDER BY name",
  )
  if (grupos.length === 0) return null

  return (
    <section aria-labelledby="titulo-grupos" className="space-y-3">
      <h2 id="titulo-grupos" className="text-sm font-semibold text-muted-foreground">
        Grupos
      </h2>
      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
        {grupos.map((g) => (
          <li key={g.id}>
            <Link
              to={rutaEspacio({ tipo: "grupo", id: g.id })}
              className="flex min-h-14 items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            >
              <span className="flex min-w-0 items-center gap-3">
                <PuntoEspacio color={g.color ?? SIN_COLOR} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{g.name}</span>
                  <ResumenGrupoLinea
                    groupId={g.id}
                    className="block truncate text-xs text-muted-foreground"
                  />
                </span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

// La linea sola, para donde ya hay una fila (el selector de espacio).
export function ResumenGrupoLinea({ groupId, className }: { groupId: string; className?: string }) {
  const { balance, miId, nombre, cargando } = useGrupo(groupId)
  return <span className={className}>{cargando ? "…" : resumenMio(balance, miId, nombre)}</span>
}
