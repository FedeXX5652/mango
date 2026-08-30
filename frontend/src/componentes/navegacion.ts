import { House, List, PieChart, Settings } from "lucide-react"
import type { LucideIcon } from "lucide-react"

export interface Destino {
  to: string
  etiqueta: string
  icono: LucideIcon
  end?: boolean
}

// Cuatro destinos: en movil son la barra inferior, en escritorio la lateral.
export const DESTINOS: Destino[] = [
  { to: "/", etiqueta: "Inicio", icono: House, end: true },
  { to: "/movimientos", etiqueta: "Movimientos", icono: List },
  { to: "/estadisticas", etiqueta: "Estadísticas", icono: PieChart },
  { to: "/ajustes", etiqueta: "Ajustes", icono: Settings },
]
