// Lo poco que la app le pide al servidor.
//
// Los datos NO se leen de aca: viven en el SQLite del dispositivo y PowerSync
// los sincroniza. La API es un buzon de escritura para esa sincronizacion (ver
// powersync/conector) mas estas cuatro cosas, que el cliente no puede hacer
// solo: las preferencias del usuario (`users` no se sincroniza), el token de
// sync, el CSV y el refresco de cotizaciones, que sale a una API publica.

import { borrarToken, tokenActual } from "@/lib/sesion"

export const API_BASE = (import.meta.env.VITE_API_URL ?? "http://localhost:8000").replace(/\/$/, "")
const BASE = API_BASE

// Cabeceras con el Bearer de la sesión, si hay. Todo lo que llama a la API pasa
// por acá para no olvidarse el token en ningún lado.
function conAuth(extra: Record<string, string> = {}): Record<string, string> {
  const token = tokenActual()
  return token ? { ...extra, Authorization: `Bearer ${token}` } : extra
}

// Error de API con el status y el detalle (para mostrar el 422 de dominio).
export class ApiError extends Error {
  constructor(
    public status: number,
    public detalle: string,
  ) {
    super(detalle)
    this.name = "ApiError"
  }
}

async function pedir<T>(path: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(`${BASE}/api/v1${path}`, {
    ...init,
    headers: conAuth({ "Content-Type": "application/json", ...(init?.headers as object) }),
  })
  // 401: la sesión no vale más (vencida, revocada, esquema nuevo). Se borra el
  // token; el proveedor de sesión reacciona y manda a login. No aplica al
  // propio login, que maneja su 401 como "credenciales mal".
  if (resp.status === 401 && !path.startsWith("/auth/login")) {
    borrarToken()
  }
  if (!resp.ok) {
    let detalle = `Error ${resp.status}`
    try {
      const cuerpo = await resp.json()
      // 422 de dominio: {detail: "..."}. 422 de Pydantic: {detail: [...]}.
      if (typeof cuerpo.detail === "string") detalle = cuerpo.detail
      else if (Array.isArray(cuerpo.detail)) detalle = "Datos inválidos"
    } catch {
      /* sin cuerpo JSON */
    }
    throw new ApiError(resp.status, detalle)
  }
  if (resp.status === 204) return undefined as T
  return (await resp.json()) as T
}

export interface CredencialesSync {
  token: string
  powersync_url: string
}

// Que hizo el refresco automatico de cotizaciones.
export interface ResultadoCotizaciones {
  actualizadas: string[]
  sin_cambios: string[]
  manuales: string[]
  fallidas: string[]
}

export interface ResultadoLogin {
  token: string
  must_change_password: boolean
}

export const api = {
  // Login: devuelve el token de sesión. Su 401 es "credenciales incorrectas",
  // no "sesión vencida", así que no borra nada (lo maneja quien llama).
  login: (username: string, password: string) =>
    pedir<ResultadoLogin>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  cambiarClave: (actual: string, nueva: string) =>
    pedir<void>("/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ actual, nueva }),
    }),
  // Grupos (fase 3b): se crean y administran por API; se leen del SQLite local.
  crearGrupo: (id: string, name: string, base_currency: string, color: string | null = null) =>
    pedir<{ id: string }>("/groups", {
      method: "POST",
      body: JSON.stringify({ id, name, base_currency, color }),
    }),
  editarGrupo: (groupId: string, cambios: { name?: string; color?: string | null }) =>
    pedir<{ id: string }>(`/groups/${groupId}`, {
      method: "PATCH",
      body: JSON.stringify(cambios),
    }),
  agregarMiembro: (groupId: string, username: string) =>
    pedir<{ id: string }>(`/groups/${groupId}/members`, {
      method: "POST",
      body: JSON.stringify({ username }),
    }),
  quitarMiembro: (groupId: string, userId: string) =>
    pedir<void>(`/groups/${groupId}/members/${userId}`, { method: "DELETE" }),
  getSyncToken: () => pedir<CredencialesSync>("/sync/token"),
  // Adjuntos (fase 5): el binario va/viene por la API, no por la sync. La
  // metadata (fila) baja por PowerSync; aca solo subimos, bajamos y borramos.
  subirAdjunto: async (txId: string, file: File): Promise<{ id: string }> => {
    const fd = new FormData()
    fd.append("file", file)
    const resp = await fetch(`${BASE}/api/v1/transactions/${txId}/attachments`, {
      method: "POST",
      headers: conAuth(), // sin Content-Type: el navegador pone el boundary
      body: fd,
    })
    if (resp.status === 401) borrarToken()
    if (!resp.ok) {
      let detalle = `Error ${resp.status}`
      try {
        const c = await resp.json()
        if (typeof c.detail === "string") detalle = c.detail
      } catch {
        /* sin JSON */
      }
      throw new ApiError(resp.status, detalle)
    }
    return await resp.json()
  },
  borrarAdjunto: (id: string) => pedir<void>(`/attachments/${id}`, { method: "DELETE" }),
  // Trae el binario como object URL (con auth). El que lo use debe revocarlo.
  urlAdjunto: async (id: string): Promise<string> => {
    const resp = await fetch(`${BASE}/api/v1/attachments/${id}/file`, { headers: conAuth() })
    if (!resp.ok) throw new ApiError(resp.status, `Error ${resp.status}`)
    return URL.createObjectURL(await resp.blob())
  },
  // Trae la cotizacion de cada moneda del usuario contra su moneda base. Es
  // idempotente por fecha (la fuente publica una por dia), asi que es seguro
  // llamarlo al abrir la app.
  refrescarCotizaciones: (forzar = false) =>
    pedir<ResultadoCotizaciones>(`/exchange-rates/refresh${forzar ? "?forzar=true" : ""}`, {
      method: "POST",
    }),
  // Export CSV: lo arma el servidor (una sola fuente de verdad del formato),
  // asi que necesita conexion. Devuelve el texto crudo, no JSON.
  exportarCsv: async (params: Record<string, string>): Promise<string> => {
    const qs = new URLSearchParams(params).toString()
    const resp = await fetch(`${BASE}/api/v1/transactions/export${qs ? `?${qs}` : ""}`, {
      headers: conAuth(),
    })
    if (resp.status === 401) borrarToken()
    if (!resp.ok) throw new ApiError(resp.status, `Error ${resp.status}`)
    return await resp.text()
  },
}
