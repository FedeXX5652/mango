import { Link } from "react-router-dom"

import { cn } from "@/lib/utils"

// Lista agrupada estilo iOS Settings: grupo redondeado con separadores hairline
// internos. FilaInset es button (tappable, con hover) segun onClick, enlace si
// lleva a otra pantalla (`to`), o div.
export function ListaInset({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "divide-y divide-border overflow-hidden rounded-xl border border-border bg-card",
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
}: {
  children: React.ReactNode
  onClick?: () => void
  to?: string
  className?: string
  // La fila abierta (el detalle del panel de escritorio): lo dice tambien al
  // lector de pantalla, no solo con el fondo.
  actual?: boolean
}) {
  const clases = cn(
    "flex w-full items-center justify-between gap-3 px-4 py-3 text-left",
    (onClick || to) && "transition-colors hover:bg-muted",
    className,
  )
  if (to) {
    return (
      <Link to={to} className={clases}>
        {children}
      </Link>
    )
  }
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={clases}
        aria-current={actual ? "true" : undefined}
      >
        {children}
      </button>
    )
  }
  return <div className={clases}>{children}</div>
}
