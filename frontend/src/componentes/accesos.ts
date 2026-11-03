import {
  ArrowLeftRight,
  ArrowUpFromLine,
  ArrowUpRight,
  CalendarClock,
  Coins,
  Files,
  HandCoins,
  Landmark,
  PieChart,
  PiggyBank,
  Repeat,
  Settings2,
  Tag,
  Tags,
  Target,
  Users,
  Wallet,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

import { type Espacio, rutaEspacio } from "@/lib/espacios"

// Accesos de Inicio (0024): el panel de atajos del Inicio movil, estilo
// MercadoPago. Cuatro elegidos y ordenados por la persona, y un "Más" al final
// que lleva a todos.
//
// **Iguales en Personal y en cada grupo** (1.13.0, ESPECIFICACION 3.10): el
// mismo panel, la misma pantalla "Más", el mismo editor. Cambia solo el
// catalogo, porque en un grupo hay cosas que en lo personal no (saldar, poner
// plata, miembros) y al reves (metas, deudas, cotizaciones). Los personales se
// guardan en `users.home_shortcuts`; los de cada grupo, en
// `users.group_shortcuts[grupo]`: son de cada persona, como el tema.
//
// Los ids son ESTABLES: se guardan en la base. Renombrar la etiqueta esta bien;
// cambiar un id deja a quien lo tenia elegido sin ese acceso (se descarta al
// normalizar, no rompe).

// Las secciones de "Más", en este orden en los dos espacios.
export type SeccionAcceso = "acciones" | "lugares" | "configuracion"

export const SECCIONES: { id: SeccionAcceso; titulo: string }[] = [
  { id: "acciones", titulo: "Acciones" },
  { id: "lugares", titulo: "Lugares" },
  { id: "configuracion", titulo: "Configuración" },
]

export interface Acceso {
  id: string
  // Nombre completo (lista de "Más", barra lateral de escritorio).
  etiqueta: string
  // Para la baldosa del panel: tiene que entrar en dos lineas de ~70 px.
  corta: string
  // Para que sirve, en una linea: nada se toca sin saber que va a pasar.
  detalle: string
  icono: LucideIcon
  seccion: SeccionAcceso
  // Un lugar. Sin `to`, una accion del espacio (saldar, poner plata): la
  // resuelve quien muestra el acceso (ver useAccionesGrupo).
  to?: string
}

export const ACCESOS: Acceso[] = [
  {
    id: "transferencia",
    etiqueta: "Transferencia",
    corta: "Transferir",
    detalle: "Pasar plata de una cuenta tuya a otra",
    to: "/nuevo?tipo=transferencia",
    icono: ArrowLeftRight,
    seccion: "acciones",
  },
  {
    id: "ingreso",
    etiqueta: "Nuevo ingreso",
    corta: "Ingreso",
    detalle: "Anotar plata que te entró",
    to: "/nuevo?tipo=ingreso",
    icono: ArrowUpRight,
    seccion: "acciones",
  },
  {
    // Calendario de pagos (1.5.0, 0030).
    id: "calendario",
    etiqueta: "Calendario de pagos",
    corta: "Calendario",
    detalle: "Lo que tenés que pagar, también lo de tus grupos",
    to: "/calendario",
    icono: CalendarClock,
    seccion: "lugares",
  },
  {
    id: "presupuesto",
    etiqueta: "Presupuesto",
    corta: "Presupuesto",
    detalle: "Tus topes de gasto del mes",
    to: "/presupuesto",
    icono: Wallet,
    seccion: "lugares",
  },
  {
    id: "estadisticas",
    etiqueta: "Estadísticas",
    corta: "Estadísticas",
    detalle: "En qué gastás y cómo viene el mes",
    to: "/estadisticas",
    icono: PieChart,
    seccion: "lugares",
  },
  {
    id: "plantillas",
    etiqueta: "Plantillas",
    corta: "Plantillas",
    detalle: "Gastos que se repiten, listos para cargar",
    to: "/plantillas",
    icono: Files,
    seccion: "lugares",
  },
  {
    id: "recurrentes",
    etiqueta: "Recurrentes",
    corta: "Recurrentes",
    detalle: "Gastos e ingresos que se cargan solos cada tanto",
    to: "/recurrentes",
    icono: Repeat,
    seccion: "lugares",
  },
  {
    id: "metas",
    etiqueta: "Metas de ahorro",
    corta: "Metas",
    detalle: "Lo que estás juntando y cuánto falta",
    to: "/metas",
    icono: Target,
    seccion: "lugares",
  },
  {
    id: "deudas",
    etiqueta: "Deudas y préstamos",
    corta: "Deudas",
    detalle: "Lo que debés y lo que te deben",
    to: "/deudas",
    icono: HandCoins,
    seccion: "lugares",
  },
  // Configuracion: lo que se ARMA una vez. Vive en Ajustes; tambien se puede
  // poner de acceso, para quien la toca seguido.
  {
    id: "categorias",
    etiqueta: "Categorías",
    corta: "Categorías",
    detalle: "Las categorías de tus gastos e ingresos",
    to: "/categorias",
    icono: Tags,
    seccion: "configuracion",
  },
  {
    id: "etiquetas",
    etiqueta: "Etiquetas",
    corta: "Etiquetas",
    detalle: "Para juntar gastos de un viaje o un proyecto",
    to: "/etiquetas",
    icono: Tag,
    seccion: "configuracion",
  },
  {
    id: "cuentas",
    etiqueta: "Cuentas",
    corta: "Cuentas",
    detalle: "Tus cuentas y tarjetas, con su saldo",
    to: "/cuentas",
    icono: Landmark,
    seccion: "configuracion",
  },
  {
    id: "cotizaciones",
    etiqueta: "Cotizaciones",
    corta: "Cotizaciones",
    detalle: "El dólar de cada moneda y las cargadas a mano",
    to: "/cotizaciones",
    icono: Coins,
    seccion: "configuracion",
  },
  {
    id: "ajustes",
    etiqueta: "Ajustes",
    corta: "Ajustes",
    detalle: "Tema, moneda, avisos y seguridad",
    to: "/ajustes",
    icono: Settings2,
    seccion: "configuracion",
  },
]

// Todo lo de un grupo (1.12.0): lo que ofrece su "Más" y la barra lateral de
// escritorio en el espacio del grupo. Antes, en escritorio, Plantillas o Metas
// llevaban a lo personal sin avisar.
export function accesosDeGrupo(groupId: string): Acceso[] {
  const ruta = (s: Parameters<typeof rutaEspacio>[1]) =>
    rutaEspacio({ tipo: "grupo", id: groupId }, s)
  const ajustes = ruta("ajustes")
  return [
    {
      id: "saldar",
      etiqueta: "Saldar",
      corta: "Saldar",
      detalle: "Pagar o dar por saldada una deuda del grupo",
      icono: HandCoins,
      seccion: "acciones",
    },
    {
      id: "poner",
      etiqueta: "Poner plata",
      corta: "Poner plata",
      detalle: "Pasar plata de tu cuenta a la cuenta conjunta",
      icono: PiggyBank,
      seccion: "acciones",
    },
    {
      id: "sacar",
      etiqueta: "Sacar plata",
      corta: "Sacar plata",
      detalle: "Pasar plata de la cuenta conjunta a tu cuenta",
      icono: ArrowUpFromLine,
      seccion: "acciones",
    },
    {
      id: "calendario",
      etiqueta: "Calendario de pagos",
      corta: "Calendario",
      detalle: "Lo que tiene que pagar el grupo",
      icono: CalendarClock,
      seccion: "lugares",
      to: ruta("calendario"),
    },
    {
      id: "presupuesto",
      etiqueta: "Presupuesto",
      corta: "Presupuesto",
      detalle: "Los topes de gasto del grupo en el mes",
      icono: Wallet,
      seccion: "lugares",
      to: ruta("presupuesto"),
    },
    {
      id: "estadisticas",
      etiqueta: "Estadísticas",
      corta: "Estadísticas",
      detalle: "En qué gasta el grupo y quién puso cuánto",
      icono: PieChart,
      seccion: "lugares",
      to: ruta("estadisticas"),
    },
    {
      id: "plantillas",
      etiqueta: "Plantillas",
      corta: "Plantillas",
      detalle: "Gastos del grupo que se repiten, listos para cargar",
      icono: Files,
      seccion: "lugares",
      to: ruta("plantillas"),
    },
    {
      id: "recurrentes",
      etiqueta: "Recurrentes",
      corta: "Recurrentes",
      detalle: "Gastos del grupo que se cargan solos cada tanto",
      icono: Repeat,
      seccion: "lugares",
      to: ruta("recurrentes"),
    },
    {
      id: "metas",
      etiqueta: "Metas de ahorro",
      corta: "Metas",
      detalle: "Lo que el grupo está juntando y cuánto falta",
      icono: Target,
      seccion: "lugares",
      to: ruta("metas"),
    },
    {
      id: "categorias",
      etiqueta: "Categorías",
      corta: "Categorías",
      detalle: "Las categorías de los gastos compartidos",
      icono: Tags,
      seccion: "configuracion",
      to: `${ajustes}#categorias`,
    },
    {
      id: "etiquetas",
      etiqueta: "Etiquetas",
      corta: "Etiquetas",
      detalle: "Para juntar gastos de un viaje o un proyecto",
      icono: Tag,
      seccion: "configuracion",
      to: `${ajustes}#etiquetas`,
    },
    {
      id: "miembros",
      etiqueta: "Miembros",
      corta: "Miembros",
      detalle: "Quiénes están, cómo se llaman y cómo se reparte",
      icono: Users,
      seccion: "configuracion",
      to: `${ajustes}#miembros`,
    },
    {
      id: "ajustes",
      etiqueta: "Ajustes del grupo",
      corta: "Ajustes",
      detalle: "Nombre, color, moneda y todo lo del grupo",
      icono: Settings2,
      seccion: "configuracion",
      to: ajustes,
    },
  ]
}

// Cuantos entran en el panel: una fila de 4 y el "Más", en las mismas cinco
// columnas que la barra inferior (0022, 0024).
export const MAX_EN_INICIO = 4

// Los de fabrica: en lo personal, las cuatro funciones que antes estaban
// escondidas en Ajustes; en un grupo, lo que mas se hace con el grupo.
export const DE_FABRICA = ["metas", "deudas", "recurrentes", "plantillas"]
export const DE_FABRICA_GRUPO = ["saldar", "poner", "calendario", "miembros"]

// Las herramientas de la barra lateral de escritorio: los lugares que no son
// ya un destino de la barra (Presupuesto, Estadisticas) ni Ajustes (va abajo).
export const HERRAMIENTAS_ESCRITORIO = [
  "calendario",
  "metas",
  "deudas",
  "recurrentes",
  "plantillas",
]
export const HERRAMIENTAS_GRUPO_ESCRITORIO = [
  "calendario",
  "metas",
  "recurrentes",
  "plantillas",
  "categorias",
  "etiquetas",
  "miembros",
]

const POR_ID = new Map(ACCESOS.map((a) => [a.id, a]))

export function acceso(id: string): Acceso | undefined {
  return POR_ID.get(id)
}

// El catalogo y los de fabrica de un espacio.
export function catalogoDe(espacio: Espacio): Acceso[] {
  return espacio.tipo === "grupo" ? accesosDeGrupo(espacio.id) : ACCESOS
}
export function deFabricaDe(espacio: Espacio): string[] {
  return espacio.tipo === "grupo" ? DE_FABRICA_GRUPO : DE_FABRICA
}

// Lo guardado, llevado a algo mostrable: null es "los de fabrica"; los ids que
// ya no existen se descartan, los repetidos tambien, y nunca pasa del tope.
export function normalizarAccesos(
  guardado: string[] | null | undefined,
  catalogo: Acceso[] = ACCESOS,
  deFabrica: string[] = DE_FABRICA,
): string[] {
  const validos = new Set(catalogo.map((a) => a.id))
  const base = guardado ?? deFabrica
  const vistos = new Set<string>()
  const salida: string[] = []
  for (const id of base) {
    if (!validos.has(id) || vistos.has(id)) continue
    vistos.add(id)
    salida.push(id)
    if (salida.length === MAX_EN_INICIO) break
  }
  return salida
}

export function agregarAcceso(lista: string[], id: string, catalogo: Acceso[] = ACCESOS): string[] {
  if (!catalogo.some((a) => a.id === id) || lista.includes(id) || lista.length >= MAX_EN_INICIO)
    return lista
  return [...lista, id]
}

export function quitarAcceso(lista: string[], id: string): string[] {
  return lista.filter((x) => x !== id)
}

// Mueve un lugar hacia adelante (-1) o hacia atras (+1). En los bordes no hace
// nada. Es la alternativa accesible a arrastrar (WCAG 2.2, 2.5.7).
export function moverAcceso(lista: string[], id: string, paso: -1 | 1): string[] {
  const i = lista.indexOf(id)
  const j = i + paso
  if (i < 0 || j < 0 || j >= lista.length) return lista
  const copia = [...lista]
  ;[copia[i], copia[j]] = [copia[j], copia[i]]
  return copia
}

// Los accesos de cada grupo, guardados como {grupo: [ids]} (1.13.0).
export function mapaJson(texto: string | null): Record<string, string[]> {
  if (!texto) return {}
  try {
    const x = JSON.parse(texto)
    if (x === null || typeof x !== "object" || Array.isArray(x)) return {}
    return Object.fromEntries(
      Object.entries(x)
        .filter(([, v]) => Array.isArray(v))
        .map(([k, v]) => [k, (v as unknown[]).map(String)]),
    )
  } catch {
    return {}
  }
}

// El mapa con los de un grupo cambiados. null vuelve a los de fabrica (se saca
// la clave).
export function conAccesosDeGrupo(
  mapa: Record<string, string[]>,
  groupId: string,
  ids: string[] | null,
): Record<string, string[]> {
  const copia = { ...mapa }
  if (ids === null) delete copia[groupId]
  else copia[groupId] = ids
  return copia
}
