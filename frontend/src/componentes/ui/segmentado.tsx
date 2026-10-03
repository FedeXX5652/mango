import { useRef } from "react"

import { cn } from "@/lib/utils"

// Control segmentado estilo iOS: pista + pildora deslizante. Un solo componente
// para movil y escritorio. El movimiento de la pildora es motion-safe (respeta
// prefers-reduced-motion).
//
// Semanticamente es elegir UN valor de varios: un grupo de radio
// (`radiogroup`/`radio` con `aria-checked`), no pestañas (no hay panel que
// mostrar). Con el teclado, como un grupo de radio nativo: Tab entra a la opcion
// elegida y las flechas cambian la eleccion.
interface Opcion<T extends string> {
  valor: T
  etiqueta: string
}
interface Props<T extends string> {
  opciones: Opcion<T>[]
  valor: T
  onCambio: (v: T) => void
  // Nombre del grupo para el lector de pantalla ("Tipo de movimiento").
  etiqueta?: string
  className?: string
}

export function Segmentado<T extends string>({
  opciones,
  valor,
  onCambio,
  etiqueta,
  className,
}: Props<T>) {
  const idx = Math.max(
    0,
    opciones.findIndex((o) => o.valor === valor),
  )
  const n = opciones.length
  const botones = useRef<(HTMLButtonElement | null)[]>([])

  function alTecla(e: React.KeyboardEvent, i: number) {
    const paso =
      e.key === "ArrowRight" || e.key === "ArrowDown"
        ? 1
        : e.key === "ArrowLeft" || e.key === "ArrowUp"
          ? -1
          : 0
    if (paso === 0) return
    e.preventDefault()
    const j = (i + paso + n) % n
    onCambio(opciones[j].valor)
    botones.current[j]?.focus()
  }

  return (
    <div
      role="radiogroup"
      aria-label={etiqueta}
      className={cn("relative grid gap-1 rounded-lg bg-muted p-1", className)}
      style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-1 rounded-md bg-card shadow-sm motion-safe:transition-transform motion-safe:duration-200 motion-safe:ease-salida"
        style={{
          left: "0.25rem",
          width: `calc((100% - 0.5rem - ${(n - 1) * 0.25}rem) / ${n})`,
          transform: `translateX(calc(${idx} * (100% + 0.25rem)))`,
        }}
      />
      {opciones.map((o, i) => (
        <button
          key={o.valor}
          ref={(el) => {
            botones.current[i] = el
          }}
          type="button"
          role="radio"
          aria-checked={o.valor === valor}
          tabIndex={o.valor === valor ? 0 : -1}
          onClick={() => onCambio(o.valor)}
          onKeyDown={(e) => alTecla(e, i)}
          className={cn(
            // 44 px de alto en el movil y 32 en escritorio. La letra va a 13 px en el
            // movil, como el control segmentado de iOS: con 15, "Transferencia"
            // no entraba en un tercio de 360 px.
            "relative z-10 min-h-11 min-w-11 rounded-md px-2 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:min-h-8 lg:px-3 lg:text-sm",
            o.valor === valor ? "text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.etiqueta}
        </button>
      ))}
    </div>
  )
}
