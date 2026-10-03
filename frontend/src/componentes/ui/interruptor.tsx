import { cn } from "@/lib/utils"

// Interruptor de encendido/apagado: pastilla con perilla que se desliza.
//
// Es un `<button role="switch">`, no un checkbox: el checkbox nativo se ve
// distinto en cada sistema operativo y no admite la pastilla. El rol y
// `aria-checked` le dan al lector de pantalla la misma semantica que tendria el
// checkbox, y el boton ya es accesible por teclado.
//
// La pastilla mide 40×24, pero el boton que la contiene es de 44 de alto: el
// area tocable recomendada (DESIGN.md 7), sin agrandar el dibujo.
//
// El deslizamiento es `motion-safe` (DESIGN.md 8): comunica el cambio de
// estado, y con `prefers-reduced-motion` queda el cambio de color solo.
export function Interruptor({
  encendido,
  onCambio,
  etiqueta,
  disabled,
  className,
}: {
  encendido: boolean
  onCambio: (valor: boolean) => void
  // Nombre accesible: la pastilla no tiene texto adentro.
  etiqueta: string
  disabled?: boolean
  className?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={encendido}
      aria-label={etiqueta}
      disabled={disabled}
      onClick={() => onCambio(!encendido)}
      className={cn(
        "group inline-flex h-11 min-w-11 shrink-0 items-center justify-center focus-visible:outline-none disabled:opacity-50",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "relative inline-flex h-6 w-10 items-center rounded-full transition-colors",
          "group-focus-visible:ring-2 group-focus-visible:ring-ring group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-card",
          encendido ? "bg-primary" : "bg-muted",
        )}
      >
        <span
          className={cn(
            "block h-4 w-4 rounded-full bg-background shadow-sm motion-safe:transition-transform motion-safe:duration-150 motion-safe:ease-salida",
            encendido ? "translate-x-5" : "translate-x-1",
          )}
        />
      </span>
    </button>
  )
}
