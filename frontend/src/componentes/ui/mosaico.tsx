import type { LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

// El icono de una fila de Ajustes: chico, en un cuadrado redondeado y relleno,
// como en los Ajustes de iOS (1.9.0). Reemplaza a los circulos pastel grandes.
// Decorativo: el nombre va al lado. `alerta`, para lo que pide atencion (los
// cambios que el servidor rechazo).
export function Mosaico({ icono: Icono, alerta }: { icono: LucideIcon; alerta?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
        alerta
          ? "bg-destructive text-destructive-foreground"
          : "bg-primary text-primary-foreground",
      )}
    >
      <Icono className="h-4 w-4" />
    </span>
  )
}
