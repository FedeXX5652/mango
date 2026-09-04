import type {
  AbstractPowerSyncDatabase,
  CrudEntry,
  PowerSyncBackendConnector,
} from "@powersync/web"
import { UpdateType } from "@powersync/web"

import { API_BASE, api } from "@/lib/api"

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
}

const JSON_HEADERS = { "Content-Type": "application/json" }

async function aplicar(entry: CrudEntry): Promise<void> {
  const base = `${API_BASE}/api/v1`
  const data = entry.opData ?? {}

  let resp: Response
  if (entry.table === "payment_method_accounts") {
    // Recurso anidado: (medio, moneda) -> cuenta.
    if (entry.op !== UpdateType.PUT) return
    resp = await fetch(`${base}/payment-methods/${data.payment_method_id}/accounts`, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ id: entry.id, currency: data.currency, account_id: data.account_id }),
    })
  } else {
    const ruta = RUTA[entry.table]
    if (!ruta) throw new Error(`Tabla sin mapeo de subida: ${entry.table}`)
    if (entry.op === UpdateType.PUT) {
      resp = await fetch(`${base}${ruta}`, {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ id: entry.id, ...data }),
      })
    } else if (entry.op === UpdateType.PATCH) {
      resp = await fetch(`${base}${ruta}/${entry.id}`, {
        method: "PATCH",
        headers: JSON_HEADERS,
        body: JSON.stringify(data),
      })
    } else {
      resp = await fetch(`${base}${ruta}/${entry.id}`, { method: "DELETE" })
    }
  }

  if (resp.ok || resp.status === 409) return // 409 = ya aplicado (reintento): ok
  if (resp.status >= 400 && resp.status < 500) {
    // Error del cliente no reintentables: se descarta para no trabar la cola.
    console.error("PowerSync: subida descartada", entry.table, entry.op, await resp.text())
    return
  }
  // 5xx / red: se relanza para que PowerSync reintente.
  throw new Error(`Subida fallida ${resp.status} en ${entry.table}`)
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
      await aplicar(entry)
    }
    await tx.complete()
  }
}
