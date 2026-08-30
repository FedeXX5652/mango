import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"

import { TEMA_POR_DEFECTO, temaValido } from "@/config/temas"
import { api } from "@/lib/api"

export type ColorScheme = "light" | "dark" | "system"

interface TemaCtx {
  temaId: string
  colorScheme: ColorScheme
  setTema: (id: string) => void
  setColorScheme: (cs: ColorScheme) => void
}

const Ctx = createContext<TemaCtx | null>(null)

const LS_TEMA = "mango.temaId"
const LS_MODO = "mango.colorScheme"

function prefiereSistemaOscuro(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
}

// Aplica tema y modo al <html>: data-tema resuelve los tokens, .dark el modo.
function aplicar(temaId: string, colorScheme: ColorScheme): void {
  const html = document.documentElement
  html.setAttribute("data-tema", temaValido(temaId) ? temaId : TEMA_POR_DEFECTO)
  const oscuro = colorScheme === "dark" || (colorScheme === "system" && prefiereSistemaOscuro())
  html.classList.toggle("dark", oscuro)
}

export function ProveedorTema({ children }: { children: React.ReactNode }) {
  const [temaId, setTemaId] = useState<string>(
    () => localStorage.getItem(LS_TEMA) ?? TEMA_POR_DEFECTO,
  )
  const [colorScheme, setColorSchemeState] = useState<ColorScheme>(
    () => (localStorage.getItem(LS_MODO) as ColorScheme) ?? "system",
  )

  // Aplica al montar y ante cada cambio.
  useEffect(() => {
    aplicar(temaId, colorScheme)
  }, [temaId, colorScheme])

  // Si sigue al sistema, reacciona a los cambios del sistema operativo.
  useEffect(() => {
    if (colorScheme !== "system") return
    const mq = window.matchMedia("(prefers-color-scheme: dark)")
    const alCambiar = () => aplicar(temaId, "system")
    mq.addEventListener("change", alCambiar)
    return () => mq.removeEventListener("change", alCambiar)
  }, [colorScheme, temaId])

  // Reconcilia con el servidor: sus valores son la fuente de verdad y viajan
  // con la sync. Si no hay backend (offline), se queda con lo local.
  useEffect(() => {
    let vigente = true
    api
      .getMe()
      .then((u) => {
        if (!vigente) return
        if (temaValido(u.theme_id)) {
          setTemaId(u.theme_id)
          localStorage.setItem(LS_TEMA, u.theme_id)
        }
        setColorSchemeState(u.color_scheme)
        localStorage.setItem(LS_MODO, u.color_scheme)
      })
      .catch(() => {})
    return () => {
      vigente = false
    }
  }, [])

  const setTema = useCallback((id: string) => {
    setTemaId(id)
    localStorage.setItem(LS_TEMA, id)
    api.updateMe({ theme_id: id }).catch(() => {})
  }, [])

  const setColorScheme = useCallback((cs: ColorScheme) => {
    setColorSchemeState(cs)
    localStorage.setItem(LS_MODO, cs)
    api.updateMe({ color_scheme: cs }).catch(() => {})
  }, [])

  const valor = useMemo(
    () => ({ temaId, colorScheme, setTema, setColorScheme }),
    [temaId, colorScheme, setTema, setColorScheme],
  )

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>
}

export function useTema(): TemaCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error("useTema debe usarse dentro de ProveedorTema")
  return ctx
}
