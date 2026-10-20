import { useQuery } from "@powersync/react"
import { Check, ChevronDown, Plus, Settings2 } from "lucide-react"
import { useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"

import { PuntoEspacio } from "@/componentes/PuntoEspacio"
import { ResumenGrupoLinea } from "@/componentes/grupo/TarjetaGrupos"
import { Button } from "@/componentes/ui/button"
import { Hoja } from "@/componentes/ui/hoja"
import { FilaInset, ListaInset } from "@/componentes/ui/listaInset"
import { useEspacio } from "@/hooks/useEspacio"
import { type Espacio, PERSONAL, rutaEspacio, seccionDeRuta } from "@/lib/espacios"
import { SIN_COLOR } from "@/lib/paleta"
import { cn } from "@/lib/utils"

// Selector de espacio (0026): el chip con el color y el nombre del espacio
// actual, siempre a la vista. Es la defensa contra el error clasico de los
// "modos" (cargar algo personal en un grupo sin darse cuenta): donde se esta se
// lee de un vistazo, y cambiar es un toque.
//
// Cambiar deja en la MISMA seccion del otro espacio (Movimientos -> Movimientos).

interface GrupoFila {
  id: string
  name: string
  color: string | null
}

export function SelectorEspacio({ className }: { className?: string }) {
  const { espacio, grupo } = useEspacio()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const [abierto, setAbierto] = useState(false)
  const { data: grupos } = useQuery<GrupoFila>(
    "SELECT id, name, color FROM groups WHERE deleted_at IS NULL ORDER BY name",
  )

  const enGrupo = espacio.tipo === "grupo"
  const nombre = enGrupo ? (grupo?.name ?? "Grupo") : "Personal"

  function ir(destino: Espacio) {
    setAbierto(false)
    navigate(rutaEspacio(destino, seccionDeRuta(pathname)))
  }
  function irA(ruta: string) {
    setAbierto(false)
    navigate(ruta)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        aria-haspopup="dialog"
        aria-label={`Espacio: ${nombre}. Cambiar de espacio`}
        className={cn(
          // Relleno suave y sin borde, como los demas controles de la cabecera
          // (1.9.0); el punto de color sigue diciendo donde se esta.
          "inline-flex min-h-11 max-w-full items-center gap-2 rounded-full bg-secondary px-3 text-sm font-semibold text-secondary-foreground transition-colors hover:bg-secondary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          className,
        )}
      >
        <PuntoEspacio color={enGrupo ? (grupo?.color ?? SIN_COLOR) : null} />
        <span className="min-w-0 flex-1 truncate text-left">{nombre}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      </button>

      <Hoja abierta={abierto} onOpenChange={setAbierto} titulo="Espacios">
        <div className="space-y-4">
          <ListaInset>
            <FilaInset onClick={() => ir(PERSONAL)}>
              <span className="flex min-w-0 items-center gap-3">
                <PuntoEspacio color={null} />
                <span className="min-w-0">
                  <span className="block truncate font-medium">Personal</span>
                  <span className="block text-xs text-muted-foreground">
                    Tu plata y tus cuentas
                  </span>
                </span>
              </span>
              {!enGrupo && <Check className="h-4 w-4 shrink-0 text-enlace" aria-label="Actual" />}
            </FilaInset>
            {grupos.map((g) => (
              <FilaInset key={g.id} onClick={() => ir({ tipo: "grupo", id: g.id })}>
                <span className="flex min-w-0 items-center gap-3">
                  <PuntoEspacio color={g.color ?? SIN_COLOR} />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{g.name}</span>
                    {/* Como quede yo en el grupo, como en el Inicio personal. */}
                    <ResumenGrupoLinea
                      groupId={g.id}
                      className="block truncate text-xs text-muted-foreground"
                    />
                  </span>
                </span>
                {enGrupo && espacio.id === g.id && (
                  <Check className="h-4 w-4 shrink-0 text-enlace" aria-label="Actual" />
                )}
              </FilaInset>
            ))}
          </ListaInset>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => irA("/grupos?nuevo=1")}>
              <Plus className="h-4 w-4" aria-hidden />
              Nuevo grupo
            </Button>
            <Button variant="secondary" onClick={() => irA("/grupos")}>
              <Settings2 className="h-4 w-4" aria-hidden />
              Administrar
            </Button>
          </div>
        </div>
      </Hoja>
    </>
  )
}

// Cabecera de una pestaña (1.9.0). En el movil, la fila del selector ES la del
// titulo: el selector a la izquierda, en el mismo lugar que en el Inicio, y a la
// derecha los controles de la pantalla. El nombre de la seccion ya lo dice la
// barra de abajo, asi que el h1 queda para el lector de pantalla; antes eran
// dos filas, la del selector y la del titulo. En escritorio el selector esta
// arriba de la barra lateral y el h1 se ve.
export function CabeceraPestana({
  titulo,
  children,
}: {
  titulo: string
  children?: React.ReactNode
}) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-2">
      <SelectorEspacio className="min-w-0 lg:hidden" />
      <h1 className="sr-only lg:not-sr-only lg:text-2xl lg:font-semibold">{titulo}</h1>
      {children && <div className="flex shrink-0 items-center gap-1">{children}</div>}
    </div>
  )
}

// Fila de arriba del Inicio de un grupo en el movil: el selector y, a la
// derecha, las acciones de la pantalla. En escritorio el selector esta arriba de
// la barra lateral, asi que esta fila no se muestra.
export function EncabezadoEspacio({ children }: { children?: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-2 lg:hidden">
      <SelectorEspacio />
      {children && <div className="flex shrink-0 items-center gap-1">{children}</div>}
    </div>
  )
}
