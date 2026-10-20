import { useId } from "react"

import { CampoContexto } from "@/componentes/ui/campoContexto"

// Una etiqueta y su control. El id de la etiqueta va por contexto: un selector
// adentro la usa para nombrarse con su valor (ver campoContexto.ts).
export function Campo({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  const id = useId()
  return (
    <label className="block space-y-2">
      <span id={id} className="text-sm text-muted-foreground">
        {etiqueta}
      </span>
      <CampoContexto.Provider value={id}>{children}</CampoContexto.Provider>
    </label>
  )
}
