import { cn } from "@/lib/utils"

// Cuenta de algo que espera (avisos sin leer, pagos por confirmar). Amarilla:
// es lo que pide atencion, sin ser un boton. Mas de 9 se lee "9+".
export function Insignia({ n, className }: { n: number; className?: string }) {
  return (
    <span
      className={cn(
        "tabular flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-xs font-semibold leading-none text-primary-foreground",
        className,
      )}
    >
      {n > 9 ? "9+" : n}
    </span>
  )
}
