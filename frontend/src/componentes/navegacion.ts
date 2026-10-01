import { House, List, PieChart, Settings, Users2, Wallet } from "lucide-react"
import type { LucideIcon } from "lucide-react"

import type { Seccion } from "@/lib/espacios"

export interface Destino {
  to: string
  etiqueta: string
  icono: LucideIcon
  end?: boolean
  // Seccion de un espacio (0026): el destino lleva a ESA seccion del espacio
  // actual (Movimientos de Casa si se esta en Casa). Sin seccion, `to` es fijo.
  seccion?: Seccion
}

// Destinos de navegacion. En escritorio la barra lateral los muestra todos.
export const DESTINOS: Destino[] = [
  { to: "/", etiqueta: "Inicio", icono: House, end: true, seccion: "" },
  { to: "/movimientos", etiqueta: "Movimientos", icono: List, seccion: "movimientos" },
  { to: "/presupuesto", etiqueta: "Presupuesto", icono: Wallet, seccion: "presupuesto" },
  { to: "/estadisticas", etiqueta: "Estadísticas", icono: PieChart, seccion: "estadisticas" },
  { to: "/grupos", etiqueta: "Grupos", icono: Users2, end: true },
  { to: "/ajustes", etiqueta: "Ajustes", icono: Settings },
]

// Barra inferior movil: CUATRO destinos, dos a cada lado del "+" (DESIGN.md 2,
// decision 0022). El numero es fijo: con cinco, el "+" dejaba de estar al
// centro y las etiquetas no entraban. Sumar un destino aca es reemplazar otro,
// no apretarlo.
//
// Afuera quedan Ajustes (en el header de Inicio) y Estadisticas: analizar es
// tarea de escritorio; en el telefono se llega desde la tarjeta de Resumen de
// Inicio y desde el atajo del icono (0023).
export const DESTINOS_MOVIL: Destino[] = [
  { to: "/", etiqueta: "Inicio", icono: House, end: true, seccion: "" },
  { to: "/movimientos", etiqueta: "Movimientos", icono: List, seccion: "movimientos" },
  { to: "/presupuesto", etiqueta: "Presupuesto", icono: Wallet, seccion: "presupuesto" },
  { to: "/grupos", etiqueta: "Grupos", icono: Users2, end: true },
]
