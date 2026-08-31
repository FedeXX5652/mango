import { PowerSyncContext } from "@powersync/react"
import { useEffect } from "react"

import { ConectorMango } from "./conector"
import { db } from "./db"

// Conecta PowerSync al montar (ya desbloqueada la app) y provee la base a los
// hooks (useQuery / usePowerSync).
export function ProveedorPowerSync({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    db.connect(new ConectorMango())
    return () => {
      void db.disconnect()
    }
  }, [])

  return <PowerSyncContext.Provider value={db}>{children}</PowerSyncContext.Provider>
}
