// Desbloqueo biometrico (huella / rostro / Windows Hello) via WebAuthn.
//
// IMPORTANTE: en fase 1 no hay servidor que verifique la asercion, asi que
// esto es una comodidad de desbloqueo, no una garantia criptografica fuerte.
// El PIN sigue siendo el secreto real y el respaldo. La verificacion fuerte de
// passkey (con challenge del servidor) llega con la auth real de fase 3.

const CLAVE = "mango.biometria.credId"

function aB64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")
}

function deB64url(texto: string): Uint8Array<ArrayBuffer> {
  const b64 = texto.replace(/-/g, "+").replace(/_/g, "/")
  const bin = atob(b64)
  // new Uint8Array(len) queda respaldado por un ArrayBuffer concreto, que es lo
  // que WebAuthn (BufferSource) espera. La anotacion explicita lo preserva.
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

export async function biometriaDisponible(): Promise<boolean> {
  if (typeof PublicKeyCredential === "undefined") return false
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
  } catch {
    return false
  }
}

export function biometriaActivada(): boolean {
  return localStorage.getItem(CLAVE) !== null
}

export async function activarBiometria(): Promise<boolean> {
  try {
    const cred = (await navigator.credentials.create({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rp: { name: "Mango", id: location.hostname },
        user: {
          id: crypto.getRandomValues(new Uint8Array(16)),
          name: "mango-local",
          displayName: "Mango",
        },
        pubKeyCredParams: [
          { type: "public-key", alg: -7 },
          { type: "public-key", alg: -257 },
        ],
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          userVerification: "required",
        },
        timeout: 60_000,
      },
    })) as PublicKeyCredential | null
    if (!cred) return false
    localStorage.setItem(CLAVE, aB64url(new Uint8Array(cred.rawId)))
    return true
  } catch {
    return false
  }
}

export async function desbloquearConBiometria(): Promise<boolean> {
  const guardado = localStorage.getItem(CLAVE)
  if (!guardado) return false
  try {
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        allowCredentials: [{ type: "public-key", id: deB64url(guardado) }],
        userVerification: "required",
        timeout: 60_000,
      },
    })
    return assertion !== null
  } catch {
    return false
  }
}

export function desactivarBiometria(): void {
  localStorage.removeItem(CLAVE)
}
