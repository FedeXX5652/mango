// Cliente REST contra la API (fase 1). En Inc 13 la escritura pasa a PowerSync;
// la lectura de preferencias del usuario seguira por aca.

const BASE = (import.meta.env.VITE_API_URL ?? "http://localhost:8000").replace(/\/$/, "")

export interface Usuario {
  id: string
  email: string
  display_name: string
  base_currency: string
  locale: string
  theme_id: string
  theme_custom: Record<string, Record<string, string>> | null
  color_scheme: "light" | "dark" | "system"
  created_at: string
  updated_at: string
}

export type PrefsUpdate = Partial<
  Pick<
    Usuario,
    "display_name" | "base_currency" | "locale" | "theme_id" | "theme_custom" | "color_scheme"
  >
>

async function pedir<T>(path: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(`${BASE}/api/v1${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  })
  if (!resp.ok) {
    throw new Error(`API ${resp.status}: ${await resp.text()}`)
  }
  return (await resp.json()) as T
}

export const api = {
  getMe: () => pedir<Usuario>("/users/me"),
  updateMe: (data: PrefsUpdate) =>
    pedir<Usuario>("/users/me", { method: "PATCH", body: JSON.stringify(data) }),
}
