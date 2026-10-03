import { createContext, useContext } from "react"

// El detalle de un movimiento abierto como PANEL al lado de la lista
// (escritorio, DESIGN.md 2). Sin panel —movil, o entrando directo— el detalle es
// una pantalla y "volver" es volver; en el panel es "Cerrar" y deja la lista
// como estaba (mes y filtros, que van en la URL).
export interface Panel {
  cerrar: () => void
}

export const PanelContexto = createContext<Panel | null>(null)

export function usePanel(): Panel | null {
  return useContext(PanelContexto)
}
