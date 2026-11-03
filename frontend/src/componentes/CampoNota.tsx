import { Plus } from "lucide-react"
import { useState } from "react"

import { Campo } from "@/componentes/ui/campo"
import { Input } from "@/componentes/ui/input"

// La nota de un movimiento (1.14.0): escondida detras de "Agregar nota" mientras
// no haya. El comercio dice donde; la nota es lo demas ("3 sesiones", "regalo
// para Kei"), y casi siempre falta: pedir los dos campos siempre era ruido. Con
// nota, se ve abierta.
export function CampoNota({ valor, onCambio }: { valor: string; onCambio: (v: string) => void }) {
  const [abierta, setAbierta] = useState(false)
  if (!abierta && !valor)
    return (
      <button
        type="button"
        onClick={() => setAbierta(true)}
        className="-my-2 inline-flex min-h-11 items-center gap-1 rounded-md text-sm font-medium text-enlace hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Plus className="h-4 w-4" aria-hidden />
        Agregar nota
      </button>
    )
  return (
    <Campo etiqueta="Nota">
      <Input
        value={valor}
        onChange={(e) => onCambio(e.target.value)}
        autoFocus={abierta && !valor}
      />
    </Campo>
  )
}
