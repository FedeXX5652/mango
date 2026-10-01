import { useQuery } from "@powersync/react"
import { useMemo } from "react"

import { normalizarAccesos } from "@/componentes/accesos"
import { guardarPreferencias, listaJson } from "@/lib/preferencias"
import { usuarioActualId } from "@/lib/sesion"

// Los accesos del panel de Inicio (0024), leidos de mi fila de `users` y
// reactivos: si los edito en otro dispositivo, cambian aca solos.
//
// Mientras la fila no bajo (primer arranque) son los de fabrica.
export function useAccesos(): { ids: string[]; guardar: (ids: string[] | null) => Promise<void> } {
  const mi = usuarioActualId() ?? ""
  const { data } = useQuery<{ home_shortcuts: string | null }>(
    "SELECT home_shortcuts FROM users WHERE id = ?",
    [mi],
  )
  const crudo = data[0]?.home_shortcuts ?? null
  const ids = useMemo(() => normalizarAccesos(listaJson(crudo)), [crudo])
  return {
    ids,
    // null vuelve a los de fabrica. Escribe local; la sync lo sube.
    guardar: (nuevos) => guardarPreferencias({ home_shortcuts: nuevos }),
  }
}
