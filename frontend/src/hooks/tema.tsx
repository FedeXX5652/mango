import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"

import { TEMA_POR_DEFECTO, temaValido } from "@/config/temas"
import { guardarPreferencias, observarPreferencias } from "@/lib/preferencias"

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

  // Reconcilia con la fila sincronizada. localStorage sigue existiendo para el
  // primer pintado —la base local todavia no esta lista y el tema no puede
  // parpadear—, pero la fuente de verdad es `users`, que viaja entre
  // dispositivos y se escribe sin conexion.
  useEffect(
    () =>
      observarPreferencias((p) => {
        if (temaValido(p.theme_id)) {
          setTemaId(p.theme_id)
          localStorage.setItem(LS_TEMA, p.theme_id)
        }
        setColorSchemeState(p.color_scheme)
        localStorage.setItem(LS_MODO, p.color_scheme)
      }),
    [],
  )

  const setTema = useCallback((id: string) => {
    setTemaId(id)
    localStorage.setItem(LS_TEMA, id)
    guardarPreferencias({ theme_id: id }).catch(() => {})
  }, [])

  const setColorScheme = useCallback((cs: ColorScheme) => {
    setColorSchemeState(cs)
    localStorage.setItem(LS_MODO, cs)
    guardarPreferencias({ color_scheme: cs }).catch(() => {})
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
