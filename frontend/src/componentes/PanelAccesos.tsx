import { Plus } from "lucide-react"
import { Link } from "react-router-dom"

import { type Acceso, catalogoDe } from "@/componentes/accesos"
import { useAccesos } from "@/hooks/useAccesos"
import { type Espacio, rutaEspacio } from "@/lib/espacios"
import { cn } from "@/lib/utils"
import { useBloqueListo } from "@/hooks/bloquesListos"

// Panel de accesos del Inicio movil (0024), estilo MercadoPago: los cuatro que
// eligio la persona y un "Más" al final que lleva a todos (y a editarlos). El
// mismo en Personal y en cada grupo (1.13.0); cambia el catalogo.
//
// Cinco columnas, las mismas que la barra inferior. En escritorio no se muestra:
// la barra lateral ya lista los destinos (DESIGN.md 2).
const BALDOSA =
  "flex min-h-20 w-full flex-col items-center justify-start gap-2 rounded-xl px-1 py-2 text-center text-xs font-medium leading-tight transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"

export function PanelAccesos({
  espacio,
  usar,
  className,
}: {
  espacio: Espacio
  // Las acciones del espacio (los accesos sin `to`): en un grupo, saldar o
  // poner plata (useAccionesGrupo).
  usar?: (a: Acceso) => void
  className?: string
}) {
  const { ids, cargando } = useAccesos(espacio)
  // Hasta que baja la fila son los de fabrica: no se muestran y se cambian.
  useBloqueListo(cargando)
  const catalogo = catalogoDe(espacio)

  return (
    <section aria-labelledby="titulo-accesos" className={cn("space-y-3", className)}>
      <h2 id="titulo-accesos" className="text-sm font-semibold text-muted-foreground">
        Accesos
      </h2>
      <ul className="grid grid-cols-5 gap-1">
        {ids.map((id) => {
          const a = catalogo.find((x) => x.id === id)
          if (!a) return null
          const contenido = (
            <>
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent text-accent-foreground">
                <a.icono className="h-5 w-5" aria-hidden />
              </span>
              {/* Dos lineas como maximo; una palabra larga se corta con guion
                  (el idioma de la pagina es es-AR). */}
              <span lang="es" className="line-clamp-2 w-full hyphens-auto break-words">
                {a.corta}
              </span>
            </>
          )
          return (
            <li key={id}>
              {a.to ? (
                <Link to={a.to} className={BALDOSA}>
                  {contenido}
                </Link>
              ) : (
                <button type="button" onClick={() => usar?.(a)} className={BALDOSA}>
                  {contenido}
                </button>
              )}
            </li>
          )
        })}
        <li className="col-start-5">
          <Link to={rutaEspacio(espacio, "accesos")} aria-label="Más accesos" className={BALDOSA}>
            <span className="flex h-12 w-12 items-center justify-center rounded-full border border-dashed border-border bg-card text-muted-foreground">
              <Plus className="h-5 w-5" aria-hidden />
            </span>
            <span>Más</span>
          </Link>
        </li>
      </ul>
    </section>
  )
}
