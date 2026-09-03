import { useEffect } from "react"
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

function ModalEscritorio({ abierta, onOpenChange, titulo, children }: Props) {
  useEffect(() => {
    if (!abierta) return
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onOpenChange(false)
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [abierta, onOpenChange])

  if (!abierta) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Cerrar"
        className="absolute inset-0 cursor-default bg-black/40 motion-safe:animate-fundir"
        onClick={() => onOpenChange(false)}
      />
      <div
        role="dialog"
        aria-modal="true"
        className="relative z-10 max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl border border-border bg-card p-4 shadow-xl motion-safe:animate-aparecer"
      >
        {titulo && <h2 className="mb-3 text-lg font-semibold">{titulo}</h2>}
        {children}
      </div>
    </div>
  )
}
