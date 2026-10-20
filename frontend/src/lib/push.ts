// Avisos push en este dispositivo (1.4.0, Web Push).
//
// La suscripcion es de ESTE navegador: se pide permiso, el navegador da un
// endpoint de su servicio de push y se le pasa al servidor (que la guarda, no se
// sincroniza). Sin heimdall no hay push: los avisos siguen en la bandeja de la
// app (decision del usuario, 2026-10-03).

import { api } from "@/lib/api"
import { usuarioActualId } from "@/lib/sesion"
import { uuidv4 } from "@/lib/uuid"

export type EstadoPush =
  | "cargando"
  // El navegador no tiene push (o es desarrollo, sin service worker).
  | "no-soportado"
  // En iPhone solo hay push con la app instalada en la pantalla de inicio.
  | "ios-instalar"
  // El servidor no tiene claves VAPID.
  | "no-disponible"
  // La persona bloqueo los avisos para Mango en el navegador.
  | "bloqueado"
  | "inactivo"
  | "activo"

export function soportaPush(): boolean {
  if (import.meta.env.DEV) return false
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window
}

export function esIosSinInstalar(): boolean {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent)
  const instalada =
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  return ios && !instalada
}

// La clave publica VAPID (base64url) como bytes, que es como la pide el navegador.
export function aBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const relleno = "=".repeat((4 - (base64url.length % 4)) % 4)
  const b64 = (base64url + relleno).replace(/-/g, "+").replace(/_/g, "/")
  const crudo = atob(b64)
  const bytes = new Uint8Array(new ArrayBuffer(crudo.length))
  for (let i = 0; i < crudo.length; i++) bytes[i] = crudo.charCodeAt(i)
  return bytes
}

// Para reconocer el dispositivo en una lista: "Chrome en Android".
export function nombreDispositivo(ua: string = navigator.userAgent): string {
  const navegador = /edg\//i.test(ua)
    ? "Edge"
    : /firefox|fxios/i.test(ua)
      ? "Firefox"
      : /chrome|crios/i.test(ua)
        ? "Chrome"
        : /safari/i.test(ua)
          ? "Safari"
          : "Navegador"
  const sistema = /android/i.test(ua)
    ? "Android"
    : /iphone/i.test(ua)
      ? "iPhone"
      : /ipad/i.test(ua)
        ? "iPad"
        : /windows/i.test(ua)
          ? "Windows"
          : /mac os/i.test(ua)
            ? "Mac"
            : /linux/i.test(ua)
              ? "Linux"
              : "otro sistema"
  return `${navegador} en ${sistema}`
}

// Tocar un aviso lleva a su pantalla, siempre dentro de la app: "//otro.sitio"
// y "/\otro.sitio" empiezan con "/" pero el navegador los resuelve como otro
// origen. (El service worker hace el mismo chequeo, public/sw-push.js.)
export function esRutaDeLaApp(link: unknown): link is string {
  return typeof link === "string" && /^\/(?![/\\])/.test(link)
}

async function suscripcionActual(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.ready
  return reg.pushManager.getSubscription()
}

function mismaClave(sub: PushSubscription, clave: Uint8Array): boolean {
  const actual = sub.options.applicationServerKey
  if (!actual) return false
  const a = new Uint8Array(actual)
  return a.length === clave.length && a.every((b, i) => b === clave[i])
}

// La suscripcion de este navegador con la clave del servidor. Si la que hay es
// de otra clave (el servidor la cambio), ya no sirve: se rehace.
async function suscribirCon(clave: Uint8Array<ArrayBuffer>): Promise<PushSubscription> {
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (sub && mismaClave(sub, clave)) return sub
  if (sub) {
    // La vieja se da de baja tambien en el servidor; si no, queda ahi hasta que
    // un envio falle.
    await api.bajaPush(sub.endpoint).catch(() => {})
    await sub.unsubscribe()
  }
  return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: clave })
}

// Familias de aviso que este dispositivo puede no querer (1.7.0). El servidor
// guarda la eleccion (null = todas, tambien las que se sumen despues).
export type Familia = "recordatorios" | "gastos" | "grupos"

export const FAMILIAS: { id: Familia; nombre: string; detalle: string }[] = [
  {
    id: "recordatorios",
    nombre: "Vencimientos",
    detalle: "Lo que vence según el calendario de pagos.",
  },
  {
    id: "gastos",
    nombre: "Gastos del grupo",
    detalle: "Cuando alguien carga un gasto en el que tenés parte.",
  },
  {
    id: "grupos",
    nombre: "Grupos",
    detalle: "Pagos, miembros y topes del presupuesto del grupo.",
  },
]

// Las familias con una prendida o apagada. Con todas prendidas vuelve a null:
// asi una familia nueva le llega sin tener que ir a prenderla.
export function conFamilia(
  actual: Familia[] | null,
  familia: Familia,
  prendida: boolean,
): Familia[] | null {
  const elegidas = new Set<Familia>(actual ?? FAMILIAS.map((f) => f.id))
  if (prendida) elegidas.add(familia)
  else elegidas.delete(familia)
  return elegidas.size === FAMILIAS.length
    ? null
    : FAMILIAS.map((f) => f.id).filter((id) => elegidas.has(id))
}

// La ultima eleccion que confirmo el servidor, para mostrarla sin pedirla: se
// actualiza cada vez que la app se re-registra. Es de cada persona (dos pueden
// usar el mismo navegador).
function claveTipos(): string {
  return `mango:push-tipos:${usuarioActualId() ?? ""}`
}

export function tiposGuardados(): Familia[] | null {
  try {
    const v = localStorage.getItem(claveTipos())
    return v ? (JSON.parse(v) as Familia[]) : null
  } catch {
    return null
  }
}

function recordarTipos(tipos: string[] | null): void {
  try {
    if (tipos === null) localStorage.removeItem(claveTipos())
    else localStorage.setItem(claveTipos(), JSON.stringify(tipos))
  } catch {
    // Sin almacenamiento la pantalla muestra "todas" hasta la proxima vez.
  }
}

// Sin `tipos` el servidor deja los que habia (lo que hace la app al abrir).
async function registrarEnServidor(sub: PushSubscription, tipos?: Familia[] | null): Promise<void> {
  const json = sub.toJSON()
  const guardada = await api.suscribirPush({
    id: uuidv4(),
    endpoint: sub.endpoint,
    keys: { p256dh: json.keys?.p256dh ?? "", auth: json.keys?.auth ?? "" },
    dispositivo: nombreDispositivo(),
    ...(tipos !== undefined && { tipos }),
  })
  recordarTipos(guardada.tipos)
}

export async function estadoPush(): Promise<EstadoPush> {
  if (!soportaPush()) return esIosSinInstalar() ? "ios-instalar" : "no-soportado"
  const config = await api.configPush()
  if (!config.disponible) return "no-disponible"
  if (Notification.permission === "denied") return "bloqueado"
  const sub = await suscripcionActual()
  return sub && Notification.permission === "granted" ? "activo" : "inactivo"
}

// Pide permiso (tiene que venir de un toque) y suscribe.
export async function activarPush(): Promise<EstadoPush> {
  const config = await api.configPush()
  if (!config.disponible || !config.clave_publica) return "no-disponible"
  const permiso = await Notification.requestPermission()
  if (permiso !== "granted") return permiso === "denied" ? "bloqueado" : "inactivo"
  // Apagar y prender no pierde lo elegido: apagar da de baja la suscripcion en
  // el servidor, y la nueva vuelve con la eleccion de antes.
  await registrarEnServidor(await suscribirCon(aBytes(config.clave_publica)), tiposGuardados())
  return "activo"
}

// Cambia las familias que acepta este dispositivo.
export async function elegirFamilias(tipos: Familia[] | null): Promise<void> {
  const sub = await suscripcionActual()
  if (!sub) return
  await registrarEnServidor(sub, tipos)
}

export async function desactivarPush(): Promise<void> {
  if (!soportaPush()) return
  const sub = await suscripcionActual()
  if (!sub) return
  // Primero el servidor (necesita la sesion): si falla, igual se da de baja aca.
  await api.bajaPush(sub.endpoint).catch(() => {})
  await sub.unsubscribe()
}

export async function probarPush(): Promise<number> {
  const sub = await suscripcionActual()
  if (!sub) return 0
  return (await api.probarPush(sub.endpoint)).enviados
}

// Al abrir la app: si este dispositivo tiene los avisos prendidos, se le
// recuerda al servidor (el endpoint puede haber cambiado, o el servidor haberlo
// perdido). Si el servidor cambio de clave, la suscripcion se rehace sola: el
// permiso ya esta dado, no hace falta un toque.
export async function refrescarSuscripcion(): Promise<void> {
  if (!soportaPush() || Notification.permission !== "granted") return
  if (!(await suscripcionActual())) return
  const config = await api.configPush()
  if (!config.disponible || !config.clave_publica) return
  await registrarEnServidor(await suscribirCon(aBytes(config.clave_publica)))
}
