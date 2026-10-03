import { useEffect } from "react"
import { useLocation } from "react-router-dom"

// Llegar a una seccion por la direccion (`/grupos/<id>/ajustes#categorias`).
//
// El navegador no lo hace solo en una SPA, y una sola llamada no alcanza: el
// contenido llega de a partes (cada seccion con su consulta) y, mientras la
// pagina es corta, no hay hasta donde bajar. Entonces, mientras la pagina crece
// en los primeros segundos, se vuelve a la seccion. Si la persona scrollea o
// toca algo, se deja de insistir.
export function useIrAAncla(activo: boolean): void {
  const { hash } = useLocation()
  useEffect(() => {
    if (!activo || !hash) return
    const id = decodeURIComponent(hash.slice(1))
    let soltado = false
    const soltar = () => {
      soltado = true
    }
    const ir = () => {
      if (!soltado) document.getElementById(id)?.scrollIntoView({ block: "start" })
    }
    const contenido = document.querySelector("main")?.firstElementChild ?? document.body
    const obs = new ResizeObserver(ir)
    obs.observe(contenido)
    const fin = window.setTimeout(() => obs.disconnect(), 2000)
    const eventos = ["wheel", "touchstart", "keydown"] as const
    eventos.forEach((e) => window.addEventListener(e, soltar, { passive: true }))
    ir()
    return () => {
      obs.disconnect()
      window.clearTimeout(fin)
      eventos.forEach((e) => window.removeEventListener(e, soltar))
    }
  }, [activo, hash])
}
