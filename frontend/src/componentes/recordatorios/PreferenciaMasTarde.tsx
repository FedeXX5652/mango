import { useQuery } from "@powersync/react"

import { Select } from "@/componentes/ui/select"
import { guardarPreferencias } from "@/lib/preferencias"
import { usuarioActualId } from "@/lib/sesion"

// Hasta cuando calla el botón "Más tarde" del aviso en Android (0030, R2). Ahí no
// se puede elegir (es un botón); en la app se elige cada vez.
type Valor = "1h" | "3h" | "manana"

const OPCIONES: { valor: Valor; etiqueta: string }[] = [
  { valor: "1h", etiqueta: "En 1 hora" },
  { valor: "3h", etiqueta: "En 3 horas" },
  { valor: "manana", etiqueta: "Mañana a las 9" },
]

export function PreferenciaMasTarde() {
  const { data } = useQuery<{ snooze_default: Valor | null }>(
    "SELECT snooze_default FROM users WHERE id = ?",
    [usuarioActualId() ?? ""],
  )
  const valor = data[0]?.snooze_default ?? "3h"
  return (
    <div className="space-y-1">
      <label className="block space-y-2">
        <span className="text-sm text-muted-foreground">«Más tarde» desde el aviso</span>
        <Select
          value={valor}
          onChange={(e) => void guardarPreferencias({ snooze_default: e.target.value as Valor })}
        >
          {OPCIONES.map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.etiqueta}
            </option>
          ))}
        </Select>
      </label>
      <p className="text-xs text-muted-foreground">El botón del aviso no deja elegir: usa esto.</p>
    </div>
  )
}
