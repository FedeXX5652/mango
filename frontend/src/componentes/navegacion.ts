import { House, List, PieChart, Settings, Wallet } from "lucide-react"
import type { LucideIcon } from "lucide-react"

export interface Destino {
  to: string
  etiqueta: string
  icono: LucideIcon
  end?: boolean
}

// Destinos de navegacion. En escritorio la barra lateral los muestra todos;
// en movil, la barra inferior usa DESTINOS_MOVIL (4) con el boton "+" al centro,
// y Ajustes vive en el header de Inicio (ver DESIGN.md 2, decision 0004).
export const DESTINOS: Destino[] = [
  { to: "/", etiqueta: "Inicio", icono: House, end: true },
  { to: "/movimientos", etiqueta: "Movimientos", icono: List },
  { to: "/presupuestos", etiqueta: "Presupuesto", icono: Wallet },
  { to: "/estadisticas", etiqueta: "Estadísticas", icono: PieChart },
  { to: "/ajustes", etiqueta: "Ajustes", icono: Settings },
]

// Barra inferior movil: 2 destinos, el "+" central, 2 destinos.
export const DESTINOS_MOVIL: Destino[] = [
  { to: "/", etiqueta: "Inicio", icono: House, end: true },
  { to: "/movimientos", etiqueta: "Movimientos", icono: List },
  { to: "/presupuestos", etiqueta: "Presupuesto", icono: Wallet },
  { to: "/estadisticas", etiqueta: "Estadísticas", icono: PieChart },
]
