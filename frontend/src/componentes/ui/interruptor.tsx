import { cn } from "@/lib/utils"

// Interruptor de encendido/apagado: pastilla con perilla que se desliza.
//
// Es un `<button role="switch">`, no un checkbox: el checkbox nativo se ve
// distinto en cada sistema operativo y no admite la pastilla. El rol y
// `aria-checked` le dan al lector de pantalla la misma semantica que tendria el
// checkbox, y el boton ya es accesible por teclado.
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
        "relative inline-flex h-6 w-10 shrink-0 items-center rounded-full transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card",
        "disabled:opacity-50",
        encendido ? "bg-primary" : "bg-muted",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "block h-4 w-4 rounded-full bg-background shadow-sm motion-safe:transition-transform motion-safe:duration-150 motion-safe:ease-salida",
          encendido ? "translate-x-5" : "translate-x-1",
        )}
      />
    </button>
  )
}
