import { PALETA } from "@/lib/paleta"
import { cn } from "@/lib/utils"

// Fila de muestras de la paleta compartida (lib/paleta). La elegida queda con un
// anillo. Se usa al crear un grupo y en sus ajustes. 36 px tocables (antes 24).
export function PaletaColor({
  valor,
  onCambio,
  className,
}: {
  valor?: string
  onCambio: (color: string) => void
  className?: string
}) {
  return (
    <div className={cn("flex flex-wrap gap-2", className)} role="radiogroup" aria-label="Color">
      {PALETA.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={valor === c}
          aria-label={`Color ${c}`}
          onClick={() => onCambio(c)}
          className={cn(
            "h-9 w-9 rounded-full transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            valor === c
              ? "ring-2 ring-foreground ring-offset-2 ring-offset-card"
              : "hover:scale-110",
          )}
          style={{ backgroundColor: c }}
        />
      ))}
    </div>
  )
}
