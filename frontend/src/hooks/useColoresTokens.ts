import { useEffect, useState } from "react"

// Lee los colores de los tokens CSS (resueltos por el tema activo) para pasarlos
// a Recharts, que necesita colores concretos. Se re-leen cuando cambia el tema
// o el modo (observando class/data-tema en <html>).
const TOKENS = ["income", "expense", "transfer", "foreground", "muted-foreground", "border"] as const
type Token = (typeof TOKENS)[number]

function leer(): Record<Token, string> {
  const cs = getComputedStyle(document.documentElement)
  const o = {} as Record<Token, string>
  for (const t of TOKENS) o[t] = cs.getPropertyValue(`--${t}`).trim() || "#888888"
  return o
}

export function useColoresTokens(): Record<Token, string> {
  const [colores, setColores] = useState<Record<Token, string>>(leer)
  useEffect(() => {
    const obs = new MutationObserver(() => setColores(leer()))
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-tema"],
    })
    setColores(leer())
    return () => obs.disconnect()
  }, [])
  return colores
}
