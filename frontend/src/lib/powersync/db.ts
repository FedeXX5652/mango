import { PowerSyncDatabase } from "@powersync/web"

import { AppSchema } from "./esquema"

// Base SQLite local del dispositivo. La app lee y escribe siempre aca; PowerSync
// sincroniza con Postgres en segundo plano (ESPECIFICACION 3.11 / 6.2).
export const db = new PowerSyncDatabase({
  schema: AppSchema,
  database: { dbFilename: "mango.db" },
})
