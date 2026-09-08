import { useEffect } from "react"

import { api } from "@/lib/api"

// Trae la cotizacion que falta, en el momento.
//
// El refresco tambien corre al abrir la app, pero eso no alcanza: si agregas
// una cuenta en euros a la tarde, el aviso de "falta la cotizacion" te
// acompaña hasta que recargues. Cuando una pantalla detecta que no pudo
// convertir una moneda, pide el refresco y las cotizaciones nuevas llegan por
// la sync.
//
// Toda moneda nueva es automatica por default: `users.fx_manual` es una lista
// de **exclusion**, asi que no hay que activar nada para que esto funcione.

// Monedas que ya se intentaron en esta carga de pagina. Evita el bucle cuando
// la fuente de verdad no cotiza ese par: se intenta una vez y se deja de
// molestar hasta la proxima vez que se abra la app.
const intentadas = new Set<string>()

export function useRefrescoCotizaciones(faltantes: string[]): void {
  // La clave es el conjunto, no el array: dos renders con las mismas monedas
  // no disparan dos pedidos.
  const clave = [...faltantes].sort().join(",")

  useEffect(() => {
    if (!clave) return
    const nuevas = clave.split(",").filter((m) => !intentadas.has(m))
    if (nuevas.length === 0) return
    for (const m of nuevas) intentadas.add(m)

    // Sin `forzar`: el refresco es idempotente por fecha, asi que solo sale a
    // la red por los pares que no tienen la cotizacion de hoy.
    api.refrescarCotizaciones().catch(() => {
      // Sin conexion no se reintenta en esta carga: la pantalla ya dice que
      // falta la cotizacion y ofrece cargarla a mano.
    })
  }, [clave])
}
