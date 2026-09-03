import { cn } from "@/lib/utils"

// Control segmentado estilo iOS: pista + pildora deslizante. Un solo componente
// para movil y escritorio (targets comodos + hover). El movimiento de la
// pildora es motion-safe (respeta prefers-reduced-motion).
interface Opcion<T extends string> {
  valor: T
  etiqueta: string
}
interface Props<T extends string> {
  opciones: Opcion<T>[]
  valor: T
  onCambio: (v: T) => void
  className?: string
}

export function Segmentado<T extends string>({ opciones, valor, onCambio, className }: Props<T>) {
  const idx = Math.max(
    0,
    opciones.findIndex((o) => o.valor === valor),
  )
  const n = opciones.length

  return (
    <div
      role="tablist"
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
      {opciones.map((o) => (
        <button
          key={o.valor}
          type="button"
          role="tab"
          aria-selected={o.valor === valor}
          onClick={() => onCambio(o.valor)}
          className={cn(
            "relative z-10 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            o.valor === valor ? "text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.etiqueta}
        </button>
      ))}
    </div>
  )
}
