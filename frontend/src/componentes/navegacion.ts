import { House, List, PieChart, Settings, Wallet } from "lucide-react"
import type { LucideIcon } from "lucide-react"

export interface Destino {
  to: string
  etiqueta: string
  icono: LucideIcon
  end?: boolean
}

// Cinco destinos: en movil son la barra inferior, en escritorio la lateral
// (ver DESIGN.md 2). Presupuestos es su propio destino (decision 0004).
export const DESTINOS: Destino[] = [
  { to: "/", etiqueta: "Inicio", icono: House, end: true },
  { to: "/movimientos", etiqueta: "Movimientos", icono: List },
  { to: "/presupuestos", etiqueta: "Presupuesto", icono: Wallet },
  { to: "/estadisticas", etiqueta: "Estadísticas", icono: PieChart },
  { to: "/ajustes", etiqueta: "Ajustes", icono: Settings },
]
