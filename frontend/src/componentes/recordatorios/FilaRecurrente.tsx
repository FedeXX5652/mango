import { Repeat } from "lucide-react"

import { Monto } from "@/componentes/Monto"
import { FilaInset } from "@/componentes/ui/listaInset"
import { formatearFechaCorta } from "@/lib/fecha"
import type { RecurrenteEnCalendario } from "@/lib/recordatorios"

// Una recurrente en el calendario de pagos (1.6.0, ver 0030). Es informacion:
// se carga sola, asi que no pide respuesta ni avisa. Tocarla lleva a
// Recurrentes, donde se pausa o se borra.
export function FilaRecurrente({ regla, fecha }: { regla: RecurrenteEnCalendario; fecha: string }) {
  return (
    <FilaInset to="/recurrentes">
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 text-sm font-medium">
          <Repeat className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <span className="truncate">{regla.name}</span>
        </span>
        <span className="block text-xs text-muted-foreground">
          {formatearFechaCorta(fecha)} · se carga solo
        </span>
      </span>
      {/* Un gasto se lee como los vencimientos (sin signo); un ingreso, con el +. */}
      <Monto
        centavos={regla.amount}
        moneda={regla.currency}
        direccion={regla.kind === "income" ? "ingreso" : "neutro"}
        variante="lista"
        className="shrink-0"
      />
    </FilaInset>
  )
}
