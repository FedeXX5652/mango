import { X } from "lucide-react"
import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"

import { type Anuncio, escucharAnuncios, tomarAnuncioPendiente } from "@/lib/anuncios"
import { cn } from "@/lib/utils"

// Donde se ven los anuncios (lib/anuncios, DESIGN.md 7 "Anuncio"): una linea
// arriba de la barra de abajo en el movil, abajo al centro en escritorio. La
// region es `aria-live` y siempre existe: un lector de pantalla anuncia lo que
// aparece aunque no se mire.
const DURACION_MS = 5000
// Con una accion (Ver, Deshacer, Revisar) o algo que importa: tiempo para tocar.
const DURACION_LARGA_MS = 8000

export function Anunciador() {
  const navigate = useNavigate()
  const [actual, setActual] = useState<(Anuncio & { n: number }) | null>(null)

  useEffect(() => {
    let n = 0
    const mostrar = (a: Anuncio) => setActual({ ...a, n: ++n })
    const quitar = escucharAnuncios(mostrar)
    // Lo que quedo de antes de recargar (la PWA se actualizo).
    const pendiente = tomarAnuncioPendiente()
    if (pendiente) queueMicrotask(() => mostrar({ texto: pendiente }))
    return quitar
  }, [])

  useEffect(() => {
    if (!actual) return
    const ms = actual.accion || actual.importante ? DURACION_LARGA_MS : DURACION_MS
    const t = setTimeout(() => setActual(null), ms)
    return () => clearTimeout(t)
  }, [actual])

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-[60] flex justify-center px-4 lg:bottom-6"
    >
      {actual && (
        <div
          key={actual.n}
          className={cn(
            "pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-xl px-4 py-3 text-sm shadow-lg motion-safe:animate-subir",
            actual.importante
              ? "bg-destructive text-destructive-foreground"
              : "bg-foreground text-background",
          )}
        >
          <p className="min-w-0 flex-1">{actual.texto}</p>
          {actual.accion && (
            <button
              type="button"
              className="shrink-0 rounded-md px-2 py-1 font-semibold underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => {
                const { to, onClick } = actual.accion!
                setActual(null)
                if (onClick) onClick()
                if (to) navigate(to)
              }}
            >
              {actual.accion.etiqueta}
            </button>
          )}
          <button
            type="button"
            aria-label="Cerrar el aviso"
            className="-mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full opacity-70 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => setActual(null)}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      )}
    </div>
  )
}
