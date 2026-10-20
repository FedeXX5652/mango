import { Archive, ArchiveRestore, Trash2 } from "lucide-react"

import { Button } from "@/componentes/ui/button"

// Archivar y eliminar, al pie de la edicion (1.9.0). Antes estaban en cada fila,
// con el lapiz: tres iconos que se amontonaban. Como en iOS, se toca la fila,
// se edita, y lo que saca algo de la lista queda abajo, separado. Cada uno pide
// su confirmacion encima de esta hoja. Sin el handler, esa accion no aparece.
// `children`: acciones propias de lo que se edita, arriba de las dos (botones
// `ghost` alineados a la izquierda, como estas).
export function AccionesEdicion({
  archivada,
  onArchivar,
  onEliminar,
  children,
}: {
  archivada?: boolean
  onArchivar?: () => void
  onEliminar?: () => void
  children?: React.ReactNode
}) {
  return (
    <div className="mt-4 flex flex-col gap-1 border-t border-border pt-3">
      {children}
      {onArchivar && (
        <Button variant="ghost" className="justify-start" onClick={onArchivar}>
          {archivada ? (
            <ArchiveRestore className="h-4 w-4" aria-hidden />
          ) : (
            <Archive className="h-4 w-4" aria-hidden />
          )}
          {archivada ? "Desarchivar" : "Archivar"}
        </Button>
      )}
      {onEliminar && (
        <Button
          variant="ghost"
          className="justify-start text-destructive hover:text-destructive"
          onClick={onEliminar}
        >
          <Trash2 className="h-4 w-4" aria-hidden />
          Eliminar
        </Button>
      )}
    </div>
  )
}

// Las mismas, como iconos sobre la fila en escritorio (FilaInset `acciones`):
// con el mouse no hace falta abrir la edicion para archivar o borrar. `nombre`
// completa la etiqueta ("Eliminar Efectivo"): hay una por fila.
export function AccionesFila({
  nombre,
  archivada,
  onArchivar,
  onEliminar,
}: {
  nombre: string
  archivada?: boolean
  onArchivar?: () => void
  onEliminar?: () => void
}) {
  return (
    <>
      {onArchivar && (
        <Button
          variant="ghost"
          size="icon"
          aria-label={`${archivada ? "Desarchivar" : "Archivar"} ${nombre}`}
          title={archivada ? "Desarchivar" : "Archivar"}
          onClick={onArchivar}
        >
          {archivada ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
        </Button>
      )}
      {onEliminar && (
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Eliminar ${nombre}`}
          title="Eliminar"
          className="text-destructive hover:text-destructive"
          onClick={onEliminar}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      )}
    </>
  )
}
