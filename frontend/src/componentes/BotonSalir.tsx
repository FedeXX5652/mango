import { ArrowLeft, X } from "lucide-react"

import { Button } from "@/componentes/ui/button"
import { usePanel } from "@/hooks/usePanel"

// El boton de arriba de un detalle: "Volver" si es una pantalla, "Cerrar" si es
// el panel al lado de la lista (escritorio, ConPanel).
export function BotonSalir({ volver }: { volver: () => void }) {
  const panel = usePanel()
  return panel ? (
    <Button variant="ghost" size="icon" onClick={panel.cerrar} aria-label="Cerrar">
      <X className="h-5 w-5" />
    </Button>
  ) : (
    <Button variant="ghost" size="icon" onClick={volver} aria-label="Volver">
      <ArrowLeft className="h-5 w-5" />
    </Button>
  )
}
