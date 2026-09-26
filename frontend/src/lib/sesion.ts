// La sesión de servidor: el token que devuelve el login y que autentica cada
// llamada a la API (fase 3a).
//
// Vive en localStorage porque el conector de PowerSync (`fetchCredentials`)
// necesita leerlo desde JS para pedir el token de sync — una cookie httpOnly no
// serviría. El costo es XSS; detrás de Tailscale y con el PIN del dispositivo,
// aceptable para una app familiar (ver ESPECIFICACION §7).
//
// "Hasta cerrar sesión": el token no se renueva ni se vence en la práctica; se
// borra con el logout. Un 401 (token viejo tras un cambio de esquema, o
// revocado) también lo borra y manda a login.

const LS_TOKEN = "mango.sesion"

// Aviso a los interesados (el proveedor de sesión) de que el token cambió,
// incluso cuando lo borra `api` al recibir un 401 desde cualquier lado.
type Escucha = (token: string | null) => void
const escuchas = new Set<Escucha>()

export function tokenActual(): string | null {
  return localStorage.getItem(LS_TOKEN)
}

export function guardarToken(token: string): void {
  localStorage.setItem(LS_TOKEN, token)
  escuchas.forEach((f) => f(token))
}

export function borrarToken(): void {
  localStorage.removeItem(LS_TOKEN)
  escuchas.forEach((f) => f(null))
}

export function alCambiarSesion(f: Escucha): () => void {
  escuchas.add(f)
  return () => escuchas.delete(f)
}

// El id del usuario logueado, del `sub` del token. Es la fuente confiable de
// "quién soy": desde 3b la tabla `users` local tiene varias filas (mi fila mas
// el perfil de los otros miembros del grupo), asi que `SELECT ... FROM users`
// ya no identifica al usuario actual.
export function usuarioActualId(): string | null {
  const token = tokenActual()
  if (!token) return null
  try {
    const payload = token.split(".")[1]
    // base64url -> base64, y `atob`.
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"))
    const sub = JSON.parse(json).sub
    return typeof sub === "string" ? sub : null
  } catch {
    return null
  }
}
