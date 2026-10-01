// Atajos del icono de la PWA (0023): la lista del manifiesto y lo que hace falta
// para que cada URL abra donde promete.
//
// Este modulo lo importa `vite.config.ts` al armar el manifiesto: nada de alias
// `@/` ni de APIs del navegador aca arriba.

// Tipo de movimiento del alta (lo importa `Alta.tsx`).
export type TipoMovimiento = "expense" | "income" | "transfer"

// `/nuevo?tipo=...`: el valor va en castellano, como las rutas.
const TIPO_POR_PARAMETRO: Record<string, TipoMovimiento> = {
  gasto: "expense",
  ingreso: "income",
  transferencia: "transfer",
}

// El tipo con el que abre el alta. Un valor desconocido no es un error: abre
// como siempre, en Gasto.
export function tipoDesdeParametro(valor: string | null | undefined): TipoMovimiento {
  return TIPO_POR_PARAMETRO[(valor ?? "").trim().toLowerCase()] ?? "expense"
}

// `/grupos/ultimo`: un atajo no puede listar los grupos de cada persona (el
// manifiesto es estatico y se pide sin sesion), asi que la URL es fija y se
// resuelve en el dispositivo. Orden: el ultimo grupo abierto ACA, si todavia es
// uno de mis grupos; si no, el unico que tengo; si no, la lista.
export function destinoUltimoGrupo(guardado: string | null, misGrupos: string[]): string {
  if (guardado && misGrupos.includes(guardado)) return `/grupos/${guardado}`
  if (misGrupos.length === 1) return `/grupos/${misGrupos[0]}`
  return "/grupos"
}

// Clave de localStorage: preferencia de este dispositivo, no del usuario.
export const LS_ULTIMO_GRUPO = "mango.ultimoGrupo"

export interface Atajo {
  name: string
  short_name: string
  description: string
  url: string
  icons: { src: string; sizes: string; type: string }[]
}

function iconos(nombre: string): Atajo["icons"] {
  return [
    { src: `icons/atajos/${nombre}-96.png`, sizes: "96x96", type: "image/png" },
    { src: `icons/atajos/${nombre}-192.png`, sizes: "192x192", type: "image/png" },
  ]
}

// En ORDEN DE PRIORIDAD: Android muestra solo los primeros (hoy 3), Windows
// hasta 10. Los tres primeros son cargar y ver lo cargado: lo que mas se hace.
export const ATAJOS: Atajo[] = [
  {
    name: "Nuevo gasto",
    short_name: "Gasto",
    description: "Cargar un gasto",
    url: "/nuevo?tipo=gasto",
    icons: iconos("gasto"),
  },
  {
    name: "Nuevo ingreso",
    short_name: "Ingreso",
    description: "Cargar un ingreso",
    url: "/nuevo?tipo=ingreso",
    icons: iconos("ingreso"),
  },
  {
    name: "Movimientos",
    short_name: "Movimientos",
    description: "Ver los movimientos del mes",
    url: "/movimientos",
    icons: iconos("movimientos"),
  },
  {
    name: "Estadísticas",
    short_name: "Estadísticas",
    description: "Ver en qué se va la plata",
    url: "/estadisticas",
    icons: iconos("estadisticas"),
  },
  {
    name: "Último grupo",
    short_name: "Grupo",
    description: "Abrir el último grupo que viste",
    url: "/grupos/ultimo",
    icons: iconos("grupo"),
  },
  {
    name: "Transferencia",
    short_name: "Transferir",
    description: "Pasar plata entre tus cuentas",
    url: "/nuevo?tipo=transferencia",
    icons: iconos("transferencia"),
  },
  {
    name: "Presupuesto",
    short_name: "Presupuesto",
    description: "Ver cuánto queda en cada sobre",
    url: "/presupuesto",
    icons: iconos("presupuesto"),
  },
]
