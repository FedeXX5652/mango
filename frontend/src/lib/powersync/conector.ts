import type {
  AbstractPowerSyncDatabase,
  CrudEntry,
  PowerSyncBackendConnector,
} from "@powersync/web"
import { UpdateType } from "@powersync/web"

import { API_BASE, api } from "@/lib/api"
import { registrarRechazo } from "@/lib/rechazados"

// Endpoint del servicio PowerSync. En el celu tiene que ser la IP de la LAN,
// por eso es configurable (si no, cae al valor que devuelve la API).
const POWERSYNC_URL = import.meta.env.VITE_POWERSYNC_URL as string | undefined

// Cada tabla local mapea a su recurso REST. La escritura sube por estos
// endpoints (los mismos que ya validan el dominio en el backend).
const RUTA: Record<string, string> = {
  transactions: "/transactions",
  accounts: "/accounts",
  categories: "/categories",
  payment_methods: "/payment-methods",
  budgets: "/budgets",
  budget_rules: "/budget-rules",
  tags: "/tags",
  transaction_tags: "/transaction-tags",
  templates: "/templates",
  recurring_rules: "/recurring",
  exchange_rates: "/exchange-rates",
  // Preferencias. Solo se modifican: crear o borrar un usuario no es cosa del
  // cliente, y por eso las otras dos operaciones se descartan abajo.
  users: "/users",
}

const JSON_HEADERS = { "Content-Type": "application/json" }

// Lo minimo para subir una escritura, sin depender de la forma de `CrudEntry`:
// asi el mismo camino sirve para la cola de PowerSync y para reintentar un
// rechazado guardado (ver lib/rechazados).
export interface Subida {
  tabla: string
  op: UpdateType
  id: string
  datos: Record<string, unknown>
}

// Resultado de intentar subir: se aplico, o el servidor la rechazo con un
// motivo (4xx). Un 5xx o un error de red NO es rechazo: se relanza para que
// PowerSync reintente solo.
export type Resultado = { ok: true } | { ok: false; motivo: string }

export async function subir({ tabla, op, id, datos }: Subida): Promise<Resultado> {
  const base = `${API_BASE}/api/v1`

  let resp: Response
  if (tabla === "payment_method_accounts") {
    // Recurso anidado: (medio, moneda) -> cuenta.
    if (op !== UpdateType.PUT) return { ok: false, motivo: "Operación no soportada" }
    resp = await fetch(`${base}/payment-methods/${datos.payment_method_id}/accounts`, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ id, currency: datos.currency, account_id: datos.account_id }),
    })
  } else {
    const ruta = RUTA[tabla]
    if (!ruta) throw new Error(`Tabla sin mapeo de subida: ${tabla}`)
    if (tabla === "users" && op !== UpdateType.PATCH) {
      // Un alta o una baja de usuario no sale del cliente.
      return { ok: false, motivo: "Solo se puede modificar el usuario, no crearlo ni borrarlo" }
    }
    if (op === UpdateType.PUT) {
      resp = await fetch(`${base}${ruta}`, {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ id, ...datos }),
      })
    } else if (op === UpdateType.PATCH) {
      resp = await fetch(`${base}${ruta}/${id}`, {
        method: "PATCH",
        headers: JSON_HEADERS,
        body: JSON.stringify(datos),
      })
    } else {
      resp = await fetch(`${base}${ruta}/${id}`, { method: "DELETE" })
    }
  }

  if (resp.ok || resp.status === 409) return { ok: true } // 409 = ya aplicado (reintento)

  if (resp.status >= 400 && resp.status < 500) {
    // El cliente no puede arreglarlo reintentando igual: es un rechazo. Se
    // guarda con el motivo del servidor (ver `aplicar`) en vez de trabar la
    // cola FIFO, que dejaria colgado todo lo que viene atras.
    return { ok: false, motivo: await motivoDe(resp) }
  }
  // 5xx / red: se relanza para que PowerSync reintente solo.
  throw new Error(`Subida fallida ${resp.status} en ${tabla}`)
}

// El `detail` de FastAPI, en texto legible. Un 422 de Pydantic trae una lista
// de errores; se arma una frase con el primero, que es el accionable.
async function motivoDe(resp: Response): Promise<string> {
  try {
    const cuerpo = await resp.json()
    const d = cuerpo?.detail
    if (typeof d === "string") return d
    if (Array.isArray(d) && d.length > 0) {
      const e = d[0]
      const campo = Array.isArray(e.loc) ? e.loc[e.loc.length - 1] : ""
      return campo ? `${campo}: ${e.msg}` : e.msg
    }
  } catch {
    /* respuesta sin JSON: se cae al generico */
  }
  return `El servidor rechazó el cambio (${resp.status})`
}

async function aplicar(db: AbstractPowerSyncDatabase, entry: CrudEntry): Promise<void> {
  const r = await subir({
    tabla: entry.table,
    op: entry.op,
    id: entry.id,
    datos: entry.opData ?? {},
  })
  if (!r.ok) {
    // No se pierde: queda en la tabla local de rechazados, a la vista y con la
    // opcion de reintentar o descartar (ver 0011). La cola sigue fluyendo.
    await registrarRechazo(db, {
      tabla: entry.table,
      op: entry.op,
      fila_id: entry.id,
      datos: JSON.stringify(entry.opData ?? {}),
      motivo: r.motivo,
    })
  }
}

export class ConectorMango implements PowerSyncBackendConnector {
  async fetchCredentials() {
    const cred = await api.getSyncToken()
    return { endpoint: POWERSYNC_URL || cred.powersync_url, token: cred.token }
  }

  async uploadData(database: AbstractPowerSyncDatabase): Promise<void> {
    const tx = await database.getNextCrudTransaction()
    if (!tx) return
    for (const entry of tx.crud) {
      await aplicar(database, entry)
    }
    await tx.complete()
  }
}
