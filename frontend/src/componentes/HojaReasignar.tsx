import { usePowerSync } from "@powersync/react"
import { useEffect, useState } from "react"

import { Button } from "@/componentes/ui/button"
import { Campo } from "@/componentes/ui/campo"
import { Hoja } from "@/componentes/ui/hoja"
import { Select } from "@/componentes/ui/select"
import type { Plan } from "@/lib/reasignar"

export interface Destino {
  id: string
  nombre: string
}

// "Eliminar y mover a...": el fallback para borrar algo que ya se uso, sin
// tocar los movimientos a mano (ESPECIFICACION 3.3).
//
// Archivar sigue siendo la regla. Esto es para cuando la entidad tiene que
// desaparecer del historial tambien: dos categorias que eran una, una cuenta
// cargada por error.
//
// Todo se escribe **local** y en una sola transaccion del SQLite: o se mueve
// todo o no se mueve nada. El conector sube los cambios cuando haya red.
export function HojaReasignar({
  abierta,
  onOpenChange,
  titulo,
  nombre,
  detalle,
  destinos,
  plan,
  onListo,
}: {
  abierta: boolean
  onOpenChange: (v: boolean) => void
  titulo: string
  // Nombre de lo que se elimina, para la frase de confirmacion.
  nombre: string
  // Cuantas cosas se mueven, en palabras ("47 movimientos").
  detalle: string
  destinos: Destino[]
  // Arma el plan una vez elegido el destino.
  plan: (destinoId: string) => Plan
  onListo?: () => void
}) {
  const db = usePowerSync()
  const [destino, setDestino] = useState("")
  const [trabajando, setTrabajando] = useState(false)
  const [error, setError] = useState("")

  // Al abrirse con otra entidad, el destino elegido antes no sirve.
  useEffect(() => {
    if (abierta) {
      setDestino(destinos[0]?.id ?? "")
      setError("")
    }
  }, [abierta, destinos])

  const elegido = destinos.find((d) => d.id === destino)
  const advertencias = destino ? plan(destino).advertencias : []

  async function ejecutar() {
    if (!destino) return setError("Elegí a dónde mover")
    setTrabajando(true)
    setError("")
    try {
      const { sentencias } = plan(destino)
      // Una sola transaccion local: si algo falla, no queda a medio mover.
      await db.writeTransaction(async (tx) => {
        for (const s of sentencias) await tx.execute(s.sql, s.params)
      })
      onOpenChange(false)
      onListo?.()
    } catch {
      setError("No se pudo completar. No se movió nada.")
    } finally {
      setTrabajando(false)
    }
  }

  return (
    <Hoja abierta={abierta} onOpenChange={onOpenChange} titulo={titulo}>
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Se elimina <strong className="text-foreground">{nombre}</strong> y {detalle} pasan a
          otra. Es lo mismo que tenerlas juntas desde el principio: el historial no pierde nada.
        </p>

        {destinos.length === 0 ? (
          <p className="text-sm text-destructive">
            No hay otra a la que mover. Creá una primero, o archivá esta en su lugar.
          </p>
        ) : (
          <>
            <Campo etiqueta="Mover a">
              <Select value={destino} onChange={(e) => setDestino(e.target.value)}>
                {destinos.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.nombre}
                  </option>
                ))}
              </Select>
            </Campo>

            {advertencias.length > 0 && (
              <ul className="space-y-1 rounded-md bg-muted p-3 text-xs text-muted-foreground">
                {advertencias.map((a) => (
                  <li key={a.que}>
                    <strong className="font-medium text-foreground">{a.que}</strong> se eliminan:{" "}
                    {a.porque}.
                  </li>
                ))}
              </ul>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex gap-2">
              {/* Destructivo: el boton principal va en rojo (DESIGN.md 7). */}
              <Button
                className="flex-1 bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={ejecutar}
                disabled={trabajando || !destino}
              >
                {trabajando ? "Moviendo…" : `Eliminar y mover a ${elegido?.nombre ?? ""}`}
              </Button>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={trabajando}>
                Cancelar
              </Button>
            </div>
          </>
        )}
      </div>
    </Hoja>
  )
}
