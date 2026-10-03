import { ArrowRight } from "lucide-react"

import { cn } from "@/lib/utils"

// "Beto → Vos" en UNA linea que, si no entra, se corta al final. Antes cada
// nombre se truncaba por su cuenta y el navegador achicaba los dos en
// proporcion: uno corto ("Vos") terminaba en "V…" aunque sobrara lugar para el.
export function DeA({
  de,
  a,
  flecha,
  className,
}: {
  de: string
  a: string
  // Lo que dice la flecha a un lector de pantalla ("le pagó a").
  flecha: string
  className?: string
}) {
  return (
    <span className={cn("block min-w-0 truncate", className)}>
      {de}{" "}
      <ArrowRight
        role="img"
        aria-label={flecha}
        className="inline h-4 w-4 align-text-bottom text-muted-foreground"
      />{" "}
      {a}
    </span>
  )
}
