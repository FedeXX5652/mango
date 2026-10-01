// Espacios (0026): Personal o un grupo, con las mismas pantallas. El espacio va
// en la URL —nunca en un "modo" escondido—, asi que la direccion siempre dice
// donde se esta y "Volver" y los atajos funcionan solos.
//
//   Personal: /            /movimientos            /presupuesto  /estadisticas  /ajustes
//   Grupo:    /grupos/<id> /grupos/<id>/movimientos ...                         /grupos/<id>/ajustes

export type Espacio = { tipo: "personal" } | { tipo: "grupo"; id: string }

export type Seccion = "" | "movimientos" | "presupuesto" | "estadisticas" | "ajustes"

export const PERSONAL: Espacio = { tipo: "personal" }

// La direccion de una seccion dentro de un espacio. "" es su Inicio.
export function rutaEspacio(espacio: Espacio, seccion: Seccion = ""): string {
  if (espacio.tipo === "personal") return seccion ? `/${seccion}` : "/"
  const base = `/grupos/${espacio.id}`
  return seccion ? `${base}/${seccion}` : base
}

// Segmentos de /grupos/<x> que NO son un grupo: la lista y el atajo (0023).
const NO_SON_GRUPO = new Set(["ultimo"])

// El espacio de una direccion. Lo que no es de un grupo es de Personal.
export function espacioDeRuta(pathname: string): Espacio {
  const m = pathname.match(/^\/grupos\/([^/]+)/)
  if (!m || NO_SON_GRUPO.has(m[1])) return PERSONAL
  return { tipo: "grupo", id: m[1] }
}

// Las secciones que existen en TODOS los espacios. Ajustes no: el de la app y el
// de un grupo son cosas distintas.
const COMUNES: Seccion[] = ["movimientos", "presupuesto", "estadisticas"]

// En que seccion comun se esta, para que cambiar de espacio deje en la misma
// pantalla (Movimientos de Personal -> Movimientos de Casa). Fuera de ellas, "".
export function seccionDeRuta(pathname: string): Seccion {
  const resto = pathname.replace(/^\/grupos\/[^/]+/, "")
  const primera = resto.split("/").filter(Boolean)[0] ?? ""
  return (COMUNES as string[]).includes(primera) ? (primera as Seccion) : ""
}
