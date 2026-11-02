// Anuncios (1.12.0): una linea que dice que paso despues de algo que la app hizo
// (guardar, borrar, cargar las recurrentes, un cambio que el servidor rechazo).
// Ningun toque hace algo sin decir que hizo. Uno a la vez; el nuevo reemplaza al
// anterior. Ver DESIGN.md 7, "Anuncio".
//
// Es un evento de la ventana y no un contexto de React: lo emite tambien codigo
// que no es un componente (el conector de PowerSync, la actualizacion de la PWA).

export interface AccionAnuncio {
  etiqueta: string
  // Un lugar de la app, o algo que hacer (Deshacer).
  to?: string
  onClick?: () => void
}

export interface Anuncio {
  texto: string
  accion?: AccionAnuncio
  // Un error que la persona tiene que ver (no se guardo algo): mas tiempo y otro
  // tono. No reemplaza a un mensaje junto al campo.
  importante?: boolean
}

const EVENTO = "mango:anuncio"

export function anunciar(texto: string, opciones: Omit<Anuncio, "texto"> = {}): void {
  window.dispatchEvent(new CustomEvent<Anuncio>(EVENTO, { detail: { texto, ...opciones } }))
}

export function escucharAnuncios(f: (a: Anuncio) => void): () => void {
  const h = (e: Event) => f((e as CustomEvent<Anuncio>).detail)
  window.addEventListener(EVENTO, h)
  return () => window.removeEventListener(EVENTO, h)
}

// Para despues de recargar (la PWA se actualizo): el anuncio sobrevive al reload.
const LS_PENDIENTE = "mango.anuncio-pendiente"

export function anunciarDespuesDeRecargar(texto: string): void {
  try {
    sessionStorage.setItem(LS_PENDIENTE, texto)
  } catch {
    // Sin storage no hay anuncio: la app sigue igual.
  }
}

export function tomarAnuncioPendiente(): string | null {
  try {
    const t = sessionStorage.getItem(LS_PENDIENTE)
    if (t) sessionStorage.removeItem(LS_PENDIENTE)
    return t
  } catch {
    return null
  }
}

// Lo que dice el alta al guardar (1.12.0): "Gasto de $ 1.500,00 guardado en
// Casa, en septiembre de 2026." El grupo y el mes, solo si no son los de siempre
// (personal, este mes): son los casos en que la lista abre en otro lado.
export function textoGuardado(g: {
  tipo: "expense" | "income" | "transfer"
  monto: string
  grupo: string | null
  mes: string | null
  ciclo: "pagado" | null
  // Sin conexion queda en el dispositivo: se dice que falta subirlo.
  sinConexion?: boolean
}): string {
  const que = g.tipo === "income" ? "Ingreso" : g.tipo === "transfer" ? "Transferencia" : "Gasto"
  const guardado = g.tipo === "transfer" ? "guardada" : "guardado"
  const donde = g.grupo ? ` en ${g.grupo}` : ""
  const cuando = g.mes ? `${g.grupo ? "," : ""} en ${g.mes}` : ""
  const pago = g.ciclo ? " El vencimiento quedó pagado." : ""
  const sube = g.sinConexion ? " Se sube cuando vuelva la conexión." : ""
  return `${que} de ${g.monto} ${guardado}${donde}${cuando}.${pago}${sube}`
}
