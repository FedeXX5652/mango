import {
  ArrowUpFromLine,
  CalendarClock,
  Files,
  HandCoins,
  PieChart,
  PiggyBank,
  Settings2,
  Tag,
  Tags,
  Users,
  Wallet,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

import { rutaEspacio } from "@/lib/espacios"

// Todo lo que se puede hacer con un grupo (1.12.0): lo que ofrece "Más" en su
// Inicio y la barra lateral de escritorio en el espacio del grupo. Antes, en
// escritorio, Plantillas o Metas llevaban a lo personal sin avisar.
//
// Cada uno dice para que sirve: nada se toca sin saber que va a pasar. Las
// acciones (saldar, poner y sacar plata) las resuelve el Inicio del grupo; el
// resto son lugares.

export type IdHerramientaGrupo =
  | "saldar"
  | "poner"
  | "sacar"
  | "calendario"
  | "presupuesto"
  | "estadisticas"
  | "plantillas"
  | "categorias"
  | "etiquetas"
  | "miembros"
  | "ajustes"

export interface HerramientaGrupo {
  id: IdHerramientaGrupo
  etiqueta: string
  // Para que sirve, en una linea.
  detalle: string
  icono: LucideIcon
  // Un lugar; sin `to`, es una accion del Inicio del grupo.
  to?: string
}

export function herramientasGrupo(groupId: string): HerramientaGrupo[] {
  const ruta = (s: Parameters<typeof rutaEspacio>[1]) =>
    rutaEspacio({ tipo: "grupo", id: groupId }, s)
  const ajustes = ruta("ajustes")
  return [
    {
      id: "saldar",
      etiqueta: "Saldar",
      detalle: "Pagar o dar por saldada una deuda del grupo",
      icono: HandCoins,
    },
    {
      id: "poner",
      etiqueta: "Poner plata",
      detalle: "Pasar plata de tu cuenta a la cuenta conjunta",
      icono: PiggyBank,
    },
    {
      id: "sacar",
      etiqueta: "Sacar plata",
      detalle: "Pasar plata de la cuenta conjunta a tu cuenta",
      icono: ArrowUpFromLine,
    },
    {
      id: "calendario",
      etiqueta: "Calendario",
      detalle: "Los vencimientos y recordatorios del grupo",
      icono: CalendarClock,
      to: `/grupos/${groupId}/calendario`,
    },
    {
      id: "presupuesto",
      etiqueta: "Presupuesto",
      detalle: "Los topes de gasto del grupo en el mes",
      icono: Wallet,
      to: ruta("presupuesto"),
    },
    {
      id: "estadisticas",
      etiqueta: "Estadísticas",
      detalle: "En qué gasta el grupo y quién puso cuánto",
      icono: PieChart,
      to: ruta("estadisticas"),
    },
    {
      id: "plantillas",
      etiqueta: "Plantillas",
      detalle: "Gastos del grupo que se repiten, listos para cargar",
      icono: Files,
      to: `${ajustes}#plantillas`,
    },
    {
      id: "categorias",
      etiqueta: "Categorías",
      detalle: "Las categorías de los gastos compartidos",
      icono: Tags,
      to: `${ajustes}#categorias`,
    },
    {
      id: "etiquetas",
      etiqueta: "Etiquetas",
      detalle: "Para juntar gastos de un viaje o un proyecto",
      icono: Tag,
      to: `${ajustes}#etiquetas`,
    },
    {
      id: "miembros",
      etiqueta: "Miembros",
      detalle: "Quiénes están en el grupo y cómo se reparte",
      icono: Users,
      to: `${ajustes}#miembros`,
    },
    {
      id: "ajustes",
      etiqueta: "Ajustes del grupo",
      detalle: "Nombre, color, moneda y todo lo del grupo",
      icono: Settings2,
      to: ajustes,
    },
  ]
}

// Los cuatro del Inicio del grupo (el resto, en "Más").
export const ACCESOS_GRUPO: IdHerramientaGrupo[] = ["saldar", "poner", "calendario", "miembros"]

// La barra lateral de escritorio en un grupo: los lugares que no son pestañas.
export const HERRAMIENTAS_GRUPO_ESCRITORIO: IdHerramientaGrupo[] = [
  "calendario",
  "plantillas",
  "categorias",
  "etiquetas",
  "miembros",
]
