import { useEffect, useId, useRef } from "react"
import { Drawer } from "vaul"

import { useLayout } from "@/hooks/useLayout"

// Presentacion responsive de un panel modal (DESIGN.md 2: dos arboles, no uno
// que estira). En movil es un bottom sheet iOS (handle + drag-to-dismiss); en
// escritorio, un modal centrado con backdrop y Esc/click-out.
interface Props {
  abierta: boolean
  onOpenChange: (v: boolean) => void
  titulo?: string
  children: React.ReactNode
}

export function Hoja({ abierta, onOpenChange, titulo, children }: Props) {
  const layout = useLayout()

  if (layout === "movil") {
    return (
      <Drawer.Root open={abierta} onOpenChange={onOpenChange}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 z-40 bg-black/40" />
          <Drawer.Content className="fixed inset-x-0 bottom-0 z-50 flex max-h-[90vh] flex-col rounded-t-2xl border-t border-border bg-card outline-none">
            <div
              className="mx-auto mt-3 h-1.5 w-10 shrink-0 rounded-full bg-muted-foreground/30"
              aria-hidden
            />
            <div className="overflow-y-auto p-4 pb-8">
              <Drawer.Title className={titulo ? "mb-3 text-lg font-semibold" : "sr-only"}>
                {titulo ?? "Panel"}
              </Drawer.Title>
              {children}
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    )
  }

  return (
    <ModalEscritorio abierta={abierta} onOpenChange={onOpenChange} titulo={titulo}>
      {children}
    </ModalEscritorio>
  )
}

// Lo que recibe foco con Tab adentro del modal.
const ENFOCABLES =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

function ModalEscritorio({ abierta, onOpenChange, titulo, children }: Props) {
  const caja = useRef<HTMLDivElement>(null)
  const idTitulo = useId()

  // Foco (WCAG 2.4.3): al abrir entra al modal; al cerrar vuelve a lo que lo
  // abrio. Antes quedaba atras, y con Tab se seguia por la pantalla de abajo.
  useEffect(() => {
    if (!abierta) return
    const previo = document.activeElement instanceof HTMLElement ? document.activeElement : null
    caja.current?.focus()
    return () => {
      if (previo?.isConnected) previo.focus()
    }
  }, [abierta])

  if (!abierta) return null

  // Las teclas las atiende el modal de ARRIBA y no siguen: con un selector
  // abierto sobre el alta, Escape (escuchado en la ventana) cerraba los dos y se
  // perdia lo cargado. Un modal anidado es descendiente del de abajo en el DOM,
  // asi que el suyo corre primero y corta la propagacion.
  function alTecla(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.stopPropagation()
      onOpenChange(false)
      return
    }
    if (e.key !== "Tab" || !caja.current) return
    // Tab da la vuelta adentro del modal (WCAG 2.1.2: se sale con Escape).
    e.stopPropagation()
    const focos = [...caja.current.querySelectorAll<HTMLElement>(ENFOCABLES)].filter(
      (el) => el.offsetParent !== null,
    )
    if (focos.length === 0) return e.preventDefault()
    const primero = focos[0]
    const ultimo = focos[focos.length - 1]
    const actual = document.activeElement
    if (e.shiftKey && (actual === primero || actual === caja.current)) {
      e.preventDefault()
      ultimo.focus()
    } else if (!e.shiftKey && (actual === ultimo || actual === caja.current)) {
      e.preventDefault()
      primero.focus()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Cerrar"
        tabIndex={-1}
        className="absolute inset-0 cursor-default bg-black/40 motion-safe:animate-fundir"
        onClick={() => onOpenChange(false)}
      />
      <div
        ref={caja}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titulo ? idTitulo : undefined}
        aria-label={titulo ? undefined : "Panel"}
        tabIndex={-1}
        onKeyDown={alTecla}
        className="relative z-10 max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl border border-border bg-card p-4 shadow-xl outline-none motion-safe:animate-aparecer"
      >
        {titulo && (
          <h2 id={idTitulo} className="mb-3 text-lg font-semibold">
            {titulo}
          </h2>
        )}
        {children}
      </div>
    </div>
  )
}
