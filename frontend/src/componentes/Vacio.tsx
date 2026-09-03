import type { LucideIcon } from "lucide-react"
import { Link } from "react-router-dom"

import { botonVariants } from "@/componentes/ui/button"
import { cn } from "@/lib/utils"

// Estado vacio consistente: icono tenue + titulo + detalle + accion opcional.
export function Vacio({
  icono: Icono,
  titulo,
  detalle,
  accion,
}: {
  icono: LucideIcon
  titulo: string
  detalle?: string
  accion?: { to: string; etiqueta: string }
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <Icono className="h-10 w-10 text-muted-foreground/40" aria-hidden />
      <div className="space-y-1">
        <p className="font-medium">{titulo}</p>
        {detalle && <p className="text-sm text-muted-foreground">{detalle}</p>}
      </div>
      {accion && (
        <Link to={accion.to} className={cn(botonVariants({ size: "sm" }))}>
          {accion.etiqueta}
        </Link>
      )}
    </div>
  )
}
