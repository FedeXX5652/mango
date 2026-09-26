import { usePowerSync, useQuery } from "@powersync/react"
import { Bell } from "lucide-react"
import { useState } from "react"
import { useNavigate } from "react-router-dom"

import { Button } from "@/componentes/ui/button"
import { Hoja } from "@/componentes/ui/hoja"
import { Vacio } from "@/componentes/Vacio"
import { formatearFechaCorta } from "@/lib/fecha"
import { cn } from "@/lib/utils"

// Bandeja de avisos in-app (fase 3b, ver 0019). Campanita con contador de no
// leidos; al abrir, la lista. Tocar un aviso lo marca leido y navega a su link.
// Los avisos los crea el servidor y bajan por la sync; el cliente solo marca
// leido (escribe read_at, que sube por PATCH).

interface Aviso {
  id: string
  title: string
  body: string
  link: string | null
  read_at: string | null
  created_at: string
}

export function Notificaciones() {
  const db = usePowerSync()
  const navigate = useNavigate()
  const [abierto, setAbierto] = useState(false)

  const { data: avisos } = useQuery<Aviso>(
    "SELECT id, title, body, link, read_at, created_at FROM notifications WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 50",
  )
  const sinLeer = avisos.filter((a) => !a.read_at).length

  async function marcarLeida(id: string) {
    await db.execute("UPDATE notifications SET read_at = ? WHERE id = ? AND read_at IS NULL", [
      new Date().toISOString(),
      id,
    ])
  }
  async function marcarTodas() {
    await db.execute("UPDATE notifications SET read_at = ? WHERE read_at IS NULL", [
      new Date().toISOString(),
    ])
  }

  async function alTocar(a: Aviso) {
    await marcarLeida(a.id)
    if (a.link) {
      setAbierto(false)
      navigate(a.link)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        aria-label={`Notificaciones${sinLeer > 0 ? ` (${sinLeer} sin leer)` : ""}`}
        className="relative flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted"
      >
        <Bell className="h-5 w-5" />
        {sinLeer > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
            {sinLeer > 9 ? "9+" : sinLeer}
          </span>
        )}
      </button>

      <Hoja abierta={abierto} onOpenChange={setAbierto} titulo="Notificaciones">
        {avisos.length === 0 ? (
          <Vacio icono={Bell} titulo="Sin novedades" detalle="Acá van a aparecer tus avisos." />
        ) : (
          <div className="space-y-3">
            {sinLeer > 0 && (
              <div className="flex justify-end">
                <Button variant="ghost" size="sm" onClick={marcarTodas}>
                  Marcar todas leídas
                </Button>
              </div>
            )}
            <ul className="space-y-1">
              {avisos.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => alTocar(a)}
                    className={cn(
                      "flex w-full items-start gap-3 rounded-lg p-3 text-left transition-colors hover:bg-muted",
                      !a.read_at && "bg-primary/5",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                        a.read_at ? "bg-transparent" : "bg-primary",
                      )}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className={cn("truncate", !a.read_at && "font-semibold")}>
                          {a.title}
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {formatearFechaCorta(a.created_at)}
                        </span>
                      </span>
                      <span className="mt-0.5 block text-sm text-muted-foreground">{a.body}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Hoja>
    </>
  )
}
