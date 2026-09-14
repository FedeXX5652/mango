import { Segmentado } from "@/componentes/ui/segmentado"
import { SelectorEntidad } from "@/componentes/SelectorEntidad"
import { cn } from "@/lib/utils"

// Elegir en que moneda se lee una pantalla. UN solo componente para las tres
// (Estadisticas, Presupuesto, Patrimonio) para que la regla no derive.
//
// La cantidad de monedas la decide el usuario, no el diseno: hoy tiene dos,
// mañana cinco. Por eso (decision 0007):
//
//   1 moneda    -> no se dibuja nada: no hay nada que elegir
//   2 monedas   -> chips (`Segmentado`): las dos opciones a la vista, un toque
//   3 o mas     -> lista en una hoja: los chips no entran en 390 px y se apilan
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

  // Era un `<select>` nativo. Paso a la hoja cuando el desplegable del sistema
  // resulto ser lo unico de la pantalla que no se puede pintar con los tokens
  // de Mango (ver SelectorEntidad).
  return (
    <SelectorEntidad
      titulo="Moneda"
      placeholder="Moneda"
      opciones={monedas.map((m) => ({ id: m, nombre: m }))}
      valor={valor}
      onCambio={onCambio}
      className={cn("h-9 w-auto", className)}
    />
  )
}
