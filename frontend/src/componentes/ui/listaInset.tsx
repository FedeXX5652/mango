import { ChevronRight } from "lucide-react"
import { Link } from "react-router-dom"

import { cn } from "@/lib/utils"

// Lista agrupada estilo iOS Settings: grupo redondeado con separadores hairline
// internos, elevado con sombra y no con borde (1.9.0). FilaInset es button
// (tappable, con hover) segun onClick, enlace si lleva a otra pantalla (`to`),
// o div.
//
// `plana`: la lista va dentro de una tarjeta y lleva solo los separadores. Una
// tarjeta nunca va dentro de otra (DESIGN.md 4).
export function ListaInset({
  children,
  className,
  plana,
}: {
  children: React.ReactNode
  className?: string
  plana?: boolean
}) {
  return (
    <div
      className={cn(
        "divide-y divide-border",
        !plana && "overflow-hidden rounded-xl bg-card shadow-tarjeta",
        className,
      )}
    >
      {children}
    </div>
  )
}

export function FilaInset({
  children,
  onClick,
  to,
  className,
  actual,
  chevron,
  acciones,
}: {
  children: React.ReactNode
  onClick?: () => void
  to?: string
  className?: string
  // La fila abierta (el detalle del panel de escritorio): lo dice tambien al
  // lector de pantalla, no solo con el fondo.
  actual?: boolean
  // "Esta fila abre algo" (la edicion): el › al final, como en iOS.
  chevron?: boolean
  // Solo con onClick. Botones de icono (archivar, eliminar) que en escritorio
  // aparecen sobre el final de la fila con el mouse o con el teclado. En el
  // telefono no: estan en la edicion que abre la fila (AccionesEdicion).
  acciones?: React.ReactNode
}) {
  // Al tocar, el fondo responde enseguida (100 ms): en el telefono no hay hover
  // y la fila no daba ninguna señal de haber recibido el toque.
  const clases = cn(
    "flex w-full items-center justify-between gap-3 px-4 py-3 text-left",
    (onClick || to) && "transition-colors duration-100 ease-salida hover:bg-muted active:bg-muted",
    className,
  )
  const contenido = chevron ? (
    <>
      <span className="flex min-w-0 flex-1 items-center justify-between gap-3">{children}</span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50" aria-hidden />
    </>
  ) : (
    children
  )
  if (to) {
    return (
      <Link to={to} className={clases}>
        {contenido}
      </Link>
    )
  }
  if (onClick) {
    const boton = (
      <button
        type="button"
        onClick={onClick}
        className={clases}
        aria-current={actual ? "true" : undefined}
      >
        {contenido}
      </button>
    )
    if (!acciones) return boton
    // Con opacidad y no con `display`: si se ocultaran del todo, al salir con
    // Tab de la fila el foco no llegaba a ellas (se ocultaban antes) y caia en
    // el body. Asi siguen en el orden de Tab y para el lector de pantalla.
    return (
      <div className="group/fila relative lg:has-[:focus-visible]:bg-muted">
        {boton}
        <div className="absolute inset-y-0 right-0 hidden items-center gap-1 bg-muted px-2 lg:pointer-events-none lg:flex lg:opacity-0 lg:transition-opacity lg:duration-100 lg:ease-salida lg:group-hover/fila:pointer-events-auto lg:group-hover/fila:opacity-100 lg:group-has-[:focus-visible]/fila:pointer-events-auto lg:group-has-[:focus-visible]/fila:opacity-100">
          {acciones}
        </div>
      </div>
    )
  }
  return <div className={clases}>{contenido}</div>
}
