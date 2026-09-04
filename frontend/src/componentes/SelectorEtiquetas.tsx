import { useQuery } from "@powersync/react"
import { Check } from "lucide-react"
import { useMemo } from "react"

import { cn } from "@/lib/utils"

interface EtiquetaOpcion {
  id: string
  name: string
  color: string | null
}

// Chips para elegir varias etiquetas (un movimiento puede tener varias o
// ninguna, ver 3.5.1). Solo muestra las activas. Si no hay ninguna creada no
// renderiza nada: no tiene sentido ocupar espacio en el alta.
export function SelectorEtiquetas({
  seleccionadas,
  onCambio,
}: {
  seleccionadas: string[]
  onCambio: (ids: string[]) => void
}) {
  const { data: etiquetas } = useQuery<EtiquetaOpcion>(
    "SELECT id, name, color FROM tags WHERE deleted_at IS NULL AND archived = 0",
  )
  const orden = useMemo(
    () => [...etiquetas].sort((a, b) => a.name.localeCompare(b.name, "es")),
    [etiquetas],
  )

  if (orden.length === 0) return null

  function alternar(id: string) {
    onCambio(
      seleccionadas.includes(id)
        ? seleccionadas.filter((x) => x !== id)
        : [...seleccionadas, id],
    )
  }

  return (
    <div className="flex flex-wrap gap-2">
      {orden.map((e) => {
        const activa = seleccionadas.includes(e.id)
        return (
          <button
            key={e.id}
            type="button"
            aria-pressed={activa}
            onClick={() => alternar(e.id)}
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors duration-100 ease-salida motion-safe:active:scale-95",
              activa
                ? "border-primary bg-accent text-accent-foreground"
                : "border-border text-muted-foreground hover:bg-muted",
            )}
          >
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: e.color ?? "#9CA3AF" }}
              aria-hidden
            />
            {e.name}
            {/* La seleccion no se comunica solo por color (DESIGN.md 9). */}
            {activa && <Check className="h-3.5 w-3.5" aria-hidden />}
          </button>
        )
      })}
    </div>
  )
}
