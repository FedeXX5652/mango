import { useQuery } from "@powersync/react"
import { useMemo } from "react"

import { type RecordatorioLocal, SQL_RECORDATORIOS } from "@/lib/recordatorios"

// Los recordatorios que siguen a una tarjeta (su cuenta, 0034) o a una deuda,
// por su id.
export function useVinculados(): {
  porTarjeta: Map<string, RecordatorioLocal>
  porDeuda: Map<string, RecordatorioLocal>
} {
  const { data } = useQuery<RecordatorioLocal>(SQL_RECORDATORIOS)
  return useMemo(() => {
    const porTarjeta = new Map<string, RecordatorioLocal>()
    const porDeuda = new Map<string, RecordatorioLocal>()
    for (const r of data) {
      if (r.account_id) porTarjeta.set(r.account_id, r)
      if (r.debt_id) porDeuda.set(r.debt_id, r)
    }
    return { porTarjeta, porDeuda }
  }, [data])
}
