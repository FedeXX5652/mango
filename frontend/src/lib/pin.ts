// Codigo de acceso (PIN) local. No viaja al servidor: es un lock del dispositivo
// (decision de fase 1). Se guarda solo el hash SHA-256 de (salt + pin), nunca el
// PIN. Sin recuperacion: olvidarlo obliga a borrar los datos locales.

import { sha256 } from "./sha256"

const CLAVE = "mango.pin"

interface PinGuardado {
  salt: string
  hash: string
}

function aHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

async function hashear(pin: string, salt: string): Promise<string> {
  const datos = new TextEncoder().encode(`${salt}:${pin}`)
  // En contexto seguro usa WebCrypto; en http de LAN cae al SHA-256 en JS
  // (mismo digest). Ver src/lib/sha256.ts.
  if (globalThis.crypto?.subtle) {
    return aHex(await crypto.subtle.digest("SHA-256", datos))
  }
  return sha256(datos)
}

export function pinDefinido(): boolean {
  return localStorage.getItem(CLAVE) !== null
}

export async function definirPin(pin: string): Promise<void> {
  const salt = aHex(crypto.getRandomValues(new Uint8Array(16)).buffer)
  const hash = await hashear(pin, salt)
  localStorage.setItem(CLAVE, JSON.stringify({ salt, hash } satisfies PinGuardado))
}

export async function verificarPin(pin: string): Promise<boolean> {
  const crudo = localStorage.getItem(CLAVE)
  if (!crudo) return false
  const { salt, hash } = JSON.parse(crudo) as PinGuardado
  return (await hashear(pin, salt)) === hash
}

export function borrarPin(): void {
  localStorage.removeItem(CLAVE)
}
