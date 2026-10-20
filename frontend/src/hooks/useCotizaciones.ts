import { useQuery } from "@powersync/react"
import { useMemo } from "react"

import {
  type Conversor,
  type FilaCotizacion,
  type Indice,
  type PreferenciasFx,
  SQL_COTIZACIONES,
  conversor,
  indexar,
} from "@/lib/cotizaciones"
import { dolarJson, listaJson } from "@/lib/preferencias"
import { usuarioActualId } from "@/lib/sesion"

// Las preferencias de cotizacion del usuario: el dolar de cada moneda y las que
// van a mano (0031). Viven en su fila de `users`, que viaja con la sync.
export function usePreferenciasFx(): PreferenciasFx {
  const { data } = useQuery<{ fx_dolar: string | null; fx_manual: string | null }>(
    "SELECT fx_dolar, fx_manual FROM users WHERE id = ?",
    [usuarioActualId() ?? ""],
  )
  const dolar = data[0]?.fx_dolar ?? null
  const manual = data[0]?.fx_manual ?? null
  return useMemo(
    () => ({ dolar: dolarJson(dolar), manuales: listaJson(manual) ?? [] }),
    [dolar, manual],
  )
}

// La serie entera, indexada, y el conversor con las preferencias del usuario.
// La usan el patrimonio (sin fecha: la ultima) y los informes (a la fecha de cada
// movimiento).
export function useCotizaciones(): {
  indice: Indice
  prefs: PreferenciasFx
  conv: Conversor
  cargando: boolean
} {
  const { data: filas, isLoading } = useQuery<FilaCotizacion>(SQL_COTIZACIONES)
  const prefs = usePreferenciasFx()
  const indice = useMemo(() => indexar(filas), [filas])
  const conv = useMemo(() => conversor(indice, prefs), [indice, prefs])
  return { indice, prefs, conv, cargando: isLoading }
}
