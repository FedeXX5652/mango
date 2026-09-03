import { cn } from "@/lib/utils"

// Lista agrupada estilo iOS Settings: grupo redondeado con separadores hairline
// internos. FilaInset es button (tappable, con hover) o div segun onClick.
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
  className,
}: {
  children: React.ReactNode
  onClick?: () => void
  className?: string
}) {
  const clases = cn(
    "flex w-full items-center justify-between gap-3 px-4 py-3 text-left",
    onClick && "transition-colors hover:bg-muted",
    className,
  )
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={clases}>
        {children}
      </button>
    )
  }
  return <div className={clases}>{children}</div>
}
