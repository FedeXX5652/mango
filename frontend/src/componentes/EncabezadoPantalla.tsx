import { ArrowLeft, Plus } from "lucide-react"

import { Button } from "@/componentes/ui/button"

// La cabecera de una pantalla que se abre desde otra: volver, el titulo y, a la
// derecha, sus acciones. Como la barra de navegacion de iOS, crear es un "+" y
// no un boton amarillo de ancho completo: el amarillo queda para la accion
// principal (DESIGN.md 7). Volver y el "+" se corren hasta el borde del
// contenido (sus iconos alinean con el texto de abajo) sin achicar su area
// tocable de 44 px; asi entra el titulo mas largo en 360 px. Un boton con
// relleno ("Listo") no se corre: su fondo quedaria pegado al borde.
export function EncabezadoPantalla({
  titulo,
  volver,
  acciones,
  children,
}: {
  titulo: string
  volver: () => void
  acciones?: React.ReactNode
  // Debajo del titulo (por ejemplo, de que grupo es).
  children?: React.ReactNode
}) {
  return (
    <header className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="icon"
        className="-ml-3 shrink-0"
        onClick={volver}
        aria-label="Volver"
      >
        <ArrowLeft className="h-5 w-5" />
      </Button>
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-2xl font-semibold">{titulo}</h1>
        {children}
      </div>
      {acciones && <div className="flex shrink-0 items-center gap-1">{acciones}</div>}
    </header>
  )
}

// El "+" de la cabecera, ultimo de las acciones. `etiqueta` es lo que crea
// ("Nueva cuenta"): el nombre del boton para el lector de pantalla y el tooltip
// con el mouse.
export function BotonNuevo({ etiqueta, onClick }: { etiqueta: string; onClick: () => void }) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className="-mr-3"
      onClick={onClick}
      aria-label={etiqueta}
      title={etiqueta}
    >
      <Plus className="h-5 w-5" />
    </Button>
  )
}
