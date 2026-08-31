// Cliente REST contra la API (fase 1). Desde Inc 13 la escritura de datos pasa
// por PowerSync (escritura local + uploadData que llama a estos endpoints); la
// lectura de preferencias y el token de sync siguen por aca.

export const API_BASE = (import.meta.env.VITE_API_URL ?? "http://localhost:8000").replace(/\/$/, "")
const BASE = API_BASE

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

export type TipoMovimiento = "expense" | "income" | "transfer"

export interface Cuenta {
  id: string
  name: string
  type: string
  currency: string
  archived: boolean
}

export interface Categoria {
  id: string
  name: string
  kind: "expense" | "income"
  parent_id: string | null
  archived: boolean
}

export interface MedioPago {
  id: string
  name: string
  kind: string
  archived: boolean
}

export interface TransaccionCrear {
  id: string
  kind: TipoMovimiento
  occurred_at: string
  amount: number
  currency: string
  account_id: string
  transfer_account_id?: string | null
  category_id?: string | null
  payment_method_id?: string | null
  payee?: string | null
  notes?: string | null
}

export interface Transaccion extends TransaccionCrear {
  status: string
  source: string
  created_at: string
  updated_at: string
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
    headers: { "Content-Type": "application/json" },
    ...init,
  })
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

export const api = {
  getMe: () => pedir<Usuario>("/users/me"),
  getSyncToken: () => pedir<CredencialesSync>("/sync/token"),
  updateMe: (data: PrefsUpdate) =>
    pedir<Usuario>("/users/me", { method: "PATCH", body: JSON.stringify(data) }),
  listAccounts: () => pedir<Cuenta[]>("/accounts"),
  listCategories: () => pedir<Categoria[]>("/categories"),
  listPaymentMethods: () => pedir<MedioPago[]>("/payment-methods"),
  listTransactions: (limite = 100) => pedir<Transaccion[]>(`/transactions?limit=${limite}`),
  createTransaction: (data: TransaccionCrear) =>
    pedir<Transaccion>("/transactions", { method: "POST", body: JSON.stringify(data) }),
}

