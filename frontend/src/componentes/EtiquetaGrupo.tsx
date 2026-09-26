import { SIN_COLOR } from "@/lib/paleta"
import { cn } from "@/lib/utils"

// Chip que marca el origen de grupo de un movimiento o una categoria (3b.2c).
// Un punto con el color del grupo + el nombre, para distinguir de un vistazo de
// que grupo viene algo cuando hay varios. Sin color, cae a un neutro.
//
// `variante`:
//   - "chip": pildora con fondo, para las tarjetas de movimiento.
//   - "punto": solo el punto + nombre en texto chico, para listas densas y
//     selectores (donde ya hay mucho texto).
export function EtiquetaGrupo({
  nombre,
  color,
  variante = "chip",
  className,
}: {
  nombre: string
  color: string | null
  variante?: "chip" | "punto"
  className?: string
}) {
  const c = color || SIN_COLOR
  if (variante === "punto") {
    return (
      <span className={cn("inline-flex items-center gap-1 text-xs text-muted-foreground", className)}>
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: c }} />
        <span className="truncate">{nombre}</span>
      </span>
    )
  }
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-medium",
        className,
      )}
      style={{ backgroundColor: `${c}1a`, color: c }}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: c }} />
      {nombre}
    </span>
  )
}
