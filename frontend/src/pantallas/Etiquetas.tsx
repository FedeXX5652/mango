import { ArrowLeft } from "lucide-react"

import { GestorEtiquetas } from "@/componentes/GestorEtiquetas"
import { Button } from "@/componentes/ui/button"
import { useVolver } from "@/hooks/useVolver"

// Las etiquetas personales. Las de un grupo se administran en Ajustes del grupo
// (1.7.0).
export function Etiquetas() {
  // A donde se vino (Inicio, Accesos, Ajustes o un atajo), no a un lugar fijo.
  const volver = useVolver("/ajustes")
  return (
    <div className="mx-auto max-w-xl space-y-4 p-4">
      <header className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={volver} aria-label="Volver">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-2xl font-semibold">Etiquetas</h1>
      </header>

      <p className="text-sm text-muted-foreground">
        La etiqueta dice a qué <strong>proyecto</strong> pertenece un gasto (un viaje, una
        refacción). Es otra dimensión que la categoría: un gasto puede tener varias o ninguna.
      </p>

      <GestorEtiquetas />
    </div>
  )
}
