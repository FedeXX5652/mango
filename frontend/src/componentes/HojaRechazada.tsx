import { usePowerSync } from "@powersync/react"
import { useState } from "react"

import { Button } from "@/componentes/ui/button"
import { Hoja } from "@/componentes/ui/hoja"
import { Input } from "@/componentes/ui/input"
import { Interruptor } from "@/componentes/ui/interruptor"
import { formatearFechaCorta } from "@/lib/fecha"
import {
  type Rechazada,
  campoDelMotivo,
  editarRechazada,
  reintentar,
  restaurarOriginal,
} from "@/lib/rechazados"
import { cn } from "@/lib/utils"

// Un cambio rechazado, para verlo y corregirlo antes de reintentar (1.7.0, ver
// 0011). Cada dato se edita con su tipo: un numero sigue siendo numero (los
// montos van en centavos), un si/no sigue siendo si/no, y lo que es una lista o
// un objeto se edita como su JSON.

type Valor = string | number | boolean | null | object

function aTexto(v: Valor): string {
  if (v === null) return ""
  if (typeof v === "object") return JSON.stringify(v)
  return String(v)
}

function deTexto(original: Valor, texto: string): Valor {
  if (typeof original === "number") {
    const n = Number(texto.replace(",", "."))
    if (texto.trim() === "" || Number.isNaN(n)) throw new Error("no es un número")
    return n
  }
  if (original !== null && typeof original === "object") return JSON.parse(texto) as object
  if (original === null) return texto.trim() === "" ? null : texto
  return texto
}

export function HojaRechazada({
  f,
  titulo,
  hayConexion,
  onCerrar,
  onDescartar,
}: {
  f: Rechazada
  titulo: string
  hayConexion: boolean
  onCerrar: () => void
  onDescartar: () => void
}) {
  const db = usePowerSync()
  const datos = JSON.parse(f.datos || "{}") as Record<string, Valor>
  const claves = Object.keys(datos).sort()
  const [textos, setTextos] = useState<Record<string, string>>(() =>
    Object.fromEntries(claves.map((k) => [k, aTexto(datos[k])])),
  )
  const [error, setError] = useState("")
  const [trabajando, setTrabajando] = useState(false)
  const marcado = campoDelMotivo(f.motivo, datos)

  function armar(): Record<string, Valor> | null {
    const salida: Record<string, Valor> = {}
    for (const k of claves) {
      const original = datos[k]
      if (typeof original === "boolean") {
        salida[k] = textos[k] === "true"
        continue
      }
      try {
        salida[k] = deTexto(original, textos[k])
      } catch {
        setError(`«${k}» no tiene un valor válido`)
        return null
      }
    }
    return salida
  }

  async function guardar(yReintentar: boolean) {
    setError("")
    const nuevos = armar()
    if (!nuevos) return
    setTrabajando(true)
    try {
      await editarRechazada(db, f.id, nuevos)
      if (yReintentar) {
        const r = await reintentar(db, [f.id])
        if (r.fallidas > 0) {
          setError("El servidor lo volvió a rechazar: mirá el motivo.")
          return
        }
      }
      onCerrar()
    } catch {
      setError("No se pudo: revisá la conexión.")
    } finally {
      setTrabajando(false)
    }
  }

  return (
    <Hoja abierta onOpenChange={(v) => !v && onCerrar()} titulo={titulo}>
      <div className="space-y-4">
        <div className="space-y-1">
          <p className="text-sm text-destructive">{f.motivo}</p>
          <p className="text-xs text-muted-foreground">
            Rechazado el {formatearFechaCorta(f.rechazada_en)}
          </p>
        </div>

        {claves.length === 0 ? (
          <p className="text-sm text-muted-foreground">Una baja no tiene datos para editar.</p>
        ) : (
          <div className="space-y-3">
            {claves.map((k) => {
              const original = datos[k]
              const id = `dato-${f.id}-${k}`
              const conError = k === marcado
              // Un si/no va con el interruptor de la app (DESIGN.md 7), no con
              // un checkbox de 20 px.
              if (typeof original === "boolean") {
                return (
                  <div key={k} className="flex items-center justify-between gap-3">
                    <span className="font-mono text-xs text-muted-foreground">
                      {k}
                      {conError && <span className="font-sans text-destructive"> · este dato</span>}
                    </span>
                    <Interruptor
                      encendido={textos[k] === "true"}
                      etiqueta={k}
                      onCambio={(v) => setTextos((t) => ({ ...t, [k]: v ? "true" : "false" }))}
                    />
                  </div>
                )
              }
              return (
                <div key={k} className="space-y-1">
                  <label htmlFor={id} className="block font-mono text-xs text-muted-foreground">
                    {k}
                    {typeof original === "number" && /amount|monto/.test(k) && " (en centavos)"}
                    {conError && <span className="font-sans text-destructive"> · este dato</span>}
                  </label>
                  <Input
                    id={id}
                    value={textos[k]}
                    aria-invalid={conError || undefined}
                    inputMode={typeof original === "number" ? "decimal" : undefined}
                    placeholder={original === null ? "(vacío)" : undefined}
                    onChange={(e) => setTextos((t) => ({ ...t, [k]: e.target.value }))}
                    className={cn("font-mono text-sm", conError && "border-destructive")}
                  />
                </div>
              )
            })}
          </div>
        )}

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="grid gap-2">
          <Button disabled={trabajando || !hayConexion} onClick={() => guardar(true)}>
            {claves.length === 0 ? "Reintentar" : "Guardar y reintentar"}
          </Button>
          {claves.length > 0 && (
            <Button variant="secondary" disabled={trabajando} onClick={() => guardar(false)}>
              Guardar sin reintentar
            </Button>
          )}
          {f.datos_original && (
            <Button
              variant="ghost"
              disabled={trabajando}
              onClick={async () => {
                await restaurarOriginal(db, f.id)
                onCerrar()
              }}
            >
              Volver a lo original
            </Button>
          )}
          <Button variant="ghost" className="text-destructive" onClick={onDescartar}>
            Descartar este cambio
          </Button>
        </div>
      </div>
    </Hoja>
  )
}
