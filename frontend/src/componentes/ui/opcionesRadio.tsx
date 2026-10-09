import { cn } from "@/lib/utils"

export interface OpcionRadio<T extends string> {
  valor: T
  etiqueta: string
  detalle?: string
}

// Una de pocas opciones que son frases ("Pasa al lunes", "Todos los meses, el día
// 10"), donde `Segmentado` no entra: radios nativos en una lista agrupada. Con
// `valor` vacio no hay nada elegido de entrada, a diferencia de `Segmentado`
// (C4: que hacer si cae en fin de semana se elige, no viene puesto). Teclado y
// lector de pantalla son los del radio nativo.
export function OpcionesRadio<T extends string>({
  nombre,
  etiqueta,
  opciones,
  valor,
  onCambio,
  className,
}: {
  // `name` del grupo: tiene que ser unico en la pantalla.
  nombre: string
  etiqueta: string
  opciones: OpcionRadio<T>[]
  valor: T | ""
  onCambio: (v: T) => void
  className?: string
}) {
  return (
    <fieldset className={cn("space-y-2", className)}>
      <legend className="mb-2 text-sm text-muted-foreground">{etiqueta}</legend>
      <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
        {opciones.map((o) => (
          <label
            key={o.valor}
            className="flex min-h-11 cursor-pointer items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted lg:min-h-10"
          >
            <input
              type="radio"
              name={nombre}
              value={o.valor}
              checked={valor === o.valor}
              onChange={() => onCambio(o.valor)}
              className="h-4 w-4 shrink-0 accent-primary"
            />
            <span className="min-w-0">
              <span className="block text-sm">{o.etiqueta}</span>
              {o.detalle && (
                <span className="block text-xs text-muted-foreground">{o.detalle}</span>
              )}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}
