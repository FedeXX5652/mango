import { Segmentado } from "@/componentes/ui/segmentado"
import { Select } from "@/componentes/ui/select"
import { cn } from "@/lib/utils"

// Elegir en que moneda se lee una pantalla. UN solo componente para las tres
// (Estadisticas, Presupuesto, Patrimonio) para que la regla no derive.
//
// La cantidad de monedas la decide el usuario, no el diseno: hoy tiene dos,
// mañana cinco. Por eso (decision 0007):
//
//   1 moneda    -> no se dibuja nada: no hay nada que elegir
//   2 monedas   -> chips (`Segmentado`): las dos opciones a la vista, un toque
//   3 o mas     -> desplegable: los chips no entran en 390 px y se apilan
//
// El corte esta en dos y no en tres porque tres chips de codigo ISO ya obligan a
// achicar el texto o a partir la fila en un telefono, y a partir de ahi el
// problema empeora con cada moneda.
export function SelectorMoneda({
  monedas,
  valor,
  onCambio,
  className,
}: {
  monedas: string[]
  valor: string
  onCambio: (moneda: string) => void
  className?: string
}) {
  if (monedas.length <= 1) return null

  if (monedas.length === 2) {
    return (
      <Segmentado
        className={cn("w-fit", className)}
        opciones={monedas.map((m) => ({ valor: m, etiqueta: m }))}
        valor={valor}
        onCambio={onCambio}
      />
    )
  }

  return (
    <Select
      // Sin etiqueta visible en varias pantallas: el nombre accesible va aca.
      aria-label="Moneda"
      value={valor}
      onChange={(e) => onCambio(e.target.value)}
      className={cn("h-9 w-auto", className)}
    >
      {monedas.map((m) => (
        <option key={m} value={m}>
          {m}
        </option>
      ))}
    </Select>
  )
}
