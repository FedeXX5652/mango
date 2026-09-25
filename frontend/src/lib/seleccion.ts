// Selección múltiple estilo explorador de archivos, como dato puro.
//
// Es la parte con casos de borde de "elegir varios de una lista" —el rango con
// Shift, el toggle con Ctrl, el ancla que recuerda desde dónde va el rango— así
// que vive aca, separada de la interfaz y probada sola. La pantalla solo traduce
// gestos (click con teclas, toque largo) a estas operaciones.
//
// La lista de ids se pasa en cada operacion porque el orden importa para el
// rango: Shift selecciona todo lo que hay ENTRE el ancla y el clickeado, y "entre"
// se define sobre el orden en pantalla.

export interface Seleccion {
  // Ids elegidos.
  ids: ReadonlySet<string>
  // Desde donde mide el rango un Shift+click. Es el ultimo tocado sin Shift.
  ancla: string | null
}

export const SELECCION_VACIA: Seleccion = { ids: new Set(), ancla: null }

export type Modificador = "ninguno" | "toggle" | "rango"

// Un click sobre `id`, con o sin teclas. `orden` son los ids como se ven.
//
// - ninguno (click pelado): queda solo ese, y pasa a ser el ancla.
// - toggle (Ctrl/Cmd): agrega o saca ese sin tocar el resto; nuevo ancla.
// - rango (Shift): todo lo que hay entre el ancla y ese, inclusive. Si no habia
//   ancla, se comporta como un click pelado.
export function alClickear(
  sel: Seleccion,
  id: string,
  modificador: Modificador,
  orden: string[],
): Seleccion {
  if (modificador === "toggle") {
    const ids = new Set(sel.ids)
    if (ids.has(id)) ids.delete(id)
    else ids.add(id)
    return { ids, ancla: id }
  }

  if (modificador === "rango" && sel.ancla !== null) {
    const desde = orden.indexOf(sel.ancla)
    const hasta = orden.indexOf(id)
    if (desde === -1 || hasta === -1) return { ids: new Set([id]), ancla: id }
    const [lo, hi] = desde <= hasta ? [desde, hasta] : [hasta, desde]
    // El ancla NO se mueve: extender el rango otra vez mide desde el mismo lugar,
    // como en cualquier explorador de archivos.
    return { ids: new Set(orden.slice(lo, hi + 1)), ancla: sel.ancla }
  }

  return { ids: new Set([id]), ancla: id }
}

// Modo selección del movil: cada toque alterna, sin teclas. El toque largo entra
// en el modo (lo maneja la pantalla) y despues cada fila es un toggle.
export function alTocarEnModo(sel: Seleccion, id: string): Seleccion {
  return alClickear(sel, id, "toggle", [])
}

export function todos(orden: string[]): Seleccion {
  return { ids: new Set(orden), ancla: orden[orden.length - 1] ?? null }
}

export function limpiar(): Seleccion {
  return SELECCION_VACIA
}

// Saca de la seleccion los ids que ya no existen (se reencolaron, se
// descartaron). Sin esto, el contador cuenta filas que se fueron.
export function podar(sel: Seleccion, existentes: string[]): Seleccion {
  const vivos = new Set(existentes)
  const ids = new Set([...sel.ids].filter((x) => vivos.has(x)))
  const ancla = sel.ancla !== null && vivos.has(sel.ancla) ? sel.ancla : null
  return { ids, ancla }
}
