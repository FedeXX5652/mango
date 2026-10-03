// Avisos push en este dispositivo (1.4.0, Web Push).
//
// La suscripcion es de ESTE navegador: se pide permiso, el navegador da un
// endpoint de su servicio de push y se le pasa al servidor (que la guarda, no se
// sincroniza). Sin heimdall no hay push: los avisos siguen en la bandeja de la
// app (decision del usuario, 2026-10-03).

import { api } from "@/lib/api"
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

async function registrarEnServidor(sub: PushSubscription): Promise<void> {
  const json = sub.toJSON()
  await api.suscribirPush({
    id: uuidv4(),
    endpoint: sub.endpoint,
    keys: { p256dh: json.keys?.p256dh ?? "", auth: json.keys?.auth ?? "" },
    dispositivo: nombreDispositivo(),
  })
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
  await registrarEnServidor(await suscribirCon(aBytes(config.clave_publica)))
  return "activo"
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
