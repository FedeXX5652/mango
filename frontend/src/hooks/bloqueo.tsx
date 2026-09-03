import { createContext, useContext, useEffect, useRef, useState } from "react"

import { pinDefinido } from "@/lib/pin"
import { PantallaBloqueo } from "@/pantallas/Bloqueo"

export type EstadoBloqueo = "sin-pin" | "bloqueado" | "desbloqueado"

interface BloqueoCtx {
  bloquear: () => void
}

const Ctx = createContext<BloqueoCtx | null>(null)

// Re-bloquea tras inactividad (PIN local + timeout, decision de fase 1).
const TIMEOUT_MS = 5 * 60 * 1000

export function ProveedorBloqueo({ children }: { children: React.ReactNode }) {
  // Si no hay PIN, primera vez (crear); si hay, arranca bloqueado.
  const [estado, setEstado] = useState<EstadoBloqueo>(() =>
    pinDefinido() ? "bloqueado" : "sin-pin",
  )
  const timer = useRef<number | undefined>(undefined)

  // Timer de inactividad: solo corre desbloqueado; cualquier actividad lo reinicia.
  useEffect(() => {
    if (estado !== "desbloqueado") return

    const reiniciar = () => {
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => setEstado("bloqueado"), TIMEOUT_MS)
    }
    const eventos = ["pointerdown", "keydown", "visibilitychange"]
    eventos.forEach((e) => window.addEventListener(e, reiniciar, { passive: true }))
    reiniciar()

    return () => {
      window.clearTimeout(timer.current)
      eventos.forEach((e) => window.removeEventListener(e, reiniciar))
    }
  }, [estado])

  if (estado !== "desbloqueado") {
    return (
      <PantallaBloqueo
        modo={estado === "sin-pin" ? "crear" : "desbloquear"}
        onListo={() => setEstado("desbloqueado")}
      />
    )
  }

  return (
    <Ctx.Provider value={{ bloquear: () => setEstado("bloqueado") }}>
      {/* Fundido al desbloquear: suaviza el salto del lock a la app (§8). */}
      <div className="h-full motion-safe:animate-fundir">{children}</div>
    </Ctx.Provider>
  )
}

export function useBloqueo(): BloqueoCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error("useBloqueo debe usarse dentro de ProveedorBloqueo")
  return ctx
}
