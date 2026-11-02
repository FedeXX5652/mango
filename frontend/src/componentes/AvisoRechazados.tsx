import { useQuery } from "@powersync/react"
import { AlertTriangle } from "lucide-react"
import { Link, useLocation } from "react-router-dom"

import { cn } from "@/lib/utils"

// Cambios que el servidor rechazo (0011), a la vista en toda la app (1.12.0):
// antes solo se veian en Movimientos personal y en Ajustes, y mientras tanto,
// en la proxima sincronizacion, el dato volvia a como estaba en el servidor y
// parecia que la app lo habia perdido. En la pantalla de rechazados no hace falta.
export function AvisoRechazados({ className }: { className?: string }) {
  const { pathname } = useLocation()
  const { data } = useQuery<{ n: number }>("SELECT count(*) AS n FROM subidas_rechazadas")
  const n = data[0]?.n ?? 0
  if (n === 0 || pathname.startsWith("/rechazados")) return null
  return (
    <Link
      to="/rechazados"
      className={cn(
        "flex items-center gap-2 bg-destructive px-4 py-2 text-sm text-destructive-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1">
        {n === 1 ? "1 cambio no se guardó" : `${n} cambios no se guardaron`} en el servidor.
      </span>
      <span className="shrink-0 font-semibold underline underline-offset-2">Revisar</span>
    </Link>
  )
}
