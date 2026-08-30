import { useEffect, useState } from "react"

// Dos arboles de layout, no un responsive que estira (DESIGN.md 2).
// Corte en 1024px: por debajo movil, por encima escritorio.
export type Layout = "movil" | "escritorio"

const CONSULTA = "(min-width: 1024px)"

export function useLayout(): Layout {
  const [layout, setLayout] = useState<Layout>(() =>
    typeof window !== "undefined" && window.matchMedia(CONSULTA).matches ? "escritorio" : "movil",
  )

  useEffect(() => {
    const mq = window.matchMedia(CONSULTA)
    const alCambiar = () => setLayout(mq.matches ? "escritorio" : "movil")
    mq.addEventListener("change", alCambiar)
    return () => mq.removeEventListener("change", alCambiar)
  }, [])

  return layout
}
