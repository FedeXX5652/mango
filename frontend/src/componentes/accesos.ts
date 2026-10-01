import {
  ArrowLeftRight,
  ArrowUpRight,
  Coins,
  CreditCard,
  Files,
  HandCoins,
  Landmark,
  PieChart,
  Repeat,
  Tag,
  Tags,
  Target,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

// Accesos de Inicio (0024): el panel de atajos del Inicio movil, estilo
// MercadoPago. Cuatro elegidos y ordenados por la persona, y un "Más" al final
// que lleva a todos. La eleccion se guarda en `users.home_shortcuts` y viaja con
// la sync, como el tema.
//
// Los ids son ESTABLES: se guardan en la base. Renombrar la etiqueta esta bien;
// cambiar un id deja a quien lo tenia elegido sin ese acceso (se descarta al
// normalizar, no rompe).

export type GrupoAcceso = "funciones" | "configuracion"

export interface Acceso {
  id: string
  // Nombre completo (lista de "Más", barra lateral de escritorio).
  etiqueta: string
  // Para la baldosa del panel: tiene que entrar en dos lineas de ~70 px.
  corta: string
  to: string
  icono: LucideIcon
  grupo: GrupoAcceso
}

export const ACCESOS: Acceso[] = [
  // Funciones: lo que se USA. Salieron de Ajustes (0024).
  {
    id: "metas",
    etiqueta: "Metas de ahorro",
    corta: "Metas",
    to: "/metas",
    icono: Target,
    grupo: "funciones",
  },
  {
    id: "deudas",
    etiqueta: "Deudas y préstamos",
    corta: "Deudas",
    to: "/deudas",
    icono: HandCoins,
    grupo: "funciones",
  },
  {
    id: "recurrentes",
    etiqueta: "Recurrentes",
    corta: "Recurrentes",
    to: "/recurrentes",
    icono: Repeat,
    grupo: "funciones",
  },
  {
    id: "plantillas",
    etiqueta: "Plantillas",
    corta: "Plantillas",
    to: "/plantillas",
    icono: Files,
    grupo: "funciones",
  },
  {
    id: "estadisticas",
    etiqueta: "Estadísticas",
    corta: "Estadísticas",
    to: "/estadisticas",
    icono: PieChart,
    grupo: "funciones",
  },
  {
    id: "transferencia",
    etiqueta: "Transferencia",
    corta: "Transferir",
    to: "/nuevo?tipo=transferencia",
    icono: ArrowLeftRight,
    grupo: "funciones",
  },
  {
    id: "ingreso",
    etiqueta: "Nuevo ingreso",
    corta: "Ingreso",
    to: "/nuevo?tipo=ingreso",
    icono: ArrowUpRight,
    grupo: "funciones",
  },
  // Configuracion: lo que se ARMA una vez. Vive en Ajustes; tambien se puede
  // poner de acceso, para quien la toca seguido.
  {
    id: "cuentas",
    etiqueta: "Cuentas",
    corta: "Cuentas",
    to: "/cuentas",
    icono: Landmark,
    grupo: "configuracion",
  },
  {
    id: "categorias",
    etiqueta: "Categorías",
    corta: "Categorías",
    to: "/categorias",
    icono: Tags,
    grupo: "configuracion",
  },
  {
    id: "medios",
    etiqueta: "Medios de pago",
    corta: "Medios",
    to: "/medios",
    icono: CreditCard,
    grupo: "configuracion",
  },
  {
    id: "etiquetas",
    etiqueta: "Etiquetas",
    corta: "Etiquetas",
    to: "/etiquetas",
    icono: Tag,
    grupo: "configuracion",
  },
  {
    id: "cotizaciones",
    etiqueta: "Cotizaciones",
    corta: "Cotizaciones",
    to: "/cotizaciones",
    icono: Coins,
    grupo: "configuracion",
  },
]

// Cuantos entran en el panel: una fila de 4 y el "Más", en las mismas cinco
// columnas que la barra inferior (0022, 0024).
export const MAX_EN_INICIO = 4

// Los de fabrica: las cuatro funciones que antes estaban escondidas en Ajustes.
export const DE_FABRICA = ["metas", "deudas", "recurrentes", "plantillas"]

// Las herramientas de la barra lateral de escritorio: las funciones que no son
// ya un destino de la barra (Estadisticas lo es) ni una accion de carga.
export const HERRAMIENTAS_ESCRITORIO = ["metas", "deudas", "recurrentes", "plantillas"]

const POR_ID = new Map(ACCESOS.map((a) => [a.id, a]))

export function acceso(id: string): Acceso | undefined {
  return POR_ID.get(id)
}

// Lo guardado, llevado a algo mostrable: null es "los de fabrica"; los ids que
// ya no existen se descartan, los repetidos tambien, y nunca pasa del tope.
export function normalizarAccesos(guardado: string[] | null | undefined): string[] {
  const base = guardado ?? DE_FABRICA
  const vistos = new Set<string>()
  const salida: string[] = []
  for (const id of base) {
    if (!POR_ID.has(id) || vistos.has(id)) continue
    vistos.add(id)
    salida.push(id)
    if (salida.length === MAX_EN_INICIO) break
  }
  return salida
}

export function agregarAcceso(lista: string[], id: string): string[] {
  if (!POR_ID.has(id) || lista.includes(id) || lista.length >= MAX_EN_INICIO) return lista
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
