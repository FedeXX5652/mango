import { createContext, useContext, useEffect, useRef, useState } from "react"

import { marcarBloqueo } from "@/lib/actualizacion"
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
  // La fija `reiniciar` al arrancar el efecto (Date.now() no va en el render).
  const ultimaActividad = useRef(0)

  // La actualizacion de la app entra en la pantalla del PIN, donde no hay nada
  // que perder (lib/actualizacion, 0028).
  useEffect(() => {
    marcarBloqueo(estado !== "desbloqueado")
  }, [estado])

  // Inactividad: solo corre desbloqueado; cualquier actividad la reinicia.
  useEffect(() => {
    if (estado !== "desbloqueado") return

    const reiniciar = () => {
      ultimaActividad.current = Date.now()
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => setEstado("bloqueado"), TIMEOUT_MS)
    }
    // Al volver a la app se mira el TIEMPO que paso, no solo el temporizador:
    // con la app en segundo plano, Android congela los temporizadores, y antes
    // volver reiniciaba la cuenta aunque hubieran pasado horas.
    const alCambiarVisibilidad = () => {
      if (document.visibilityState !== "visible") return
      if (Date.now() - ultimaActividad.current >= TIMEOUT_MS) setEstado("bloqueado")
      else reiniciar()
    }
    const eventos = ["pointerdown", "keydown"]
    eventos.forEach((e) => window.addEventListener(e, reiniciar, { passive: true }))
    document.addEventListener("visibilitychange", alCambiarVisibilidad)
    reiniciar()

    return () => {
      window.clearTimeout(timer.current)
      eventos.forEach((e) => window.removeEventListener(e, reiniciar))
      document.removeEventListener("visibilitychange", alCambiarVisibilidad)
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
