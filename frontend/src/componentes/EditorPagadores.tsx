import { useEffect, useState } from "react"

import { Input } from "@/componentes/ui/input"
import { Segmentado } from "@/componentes/ui/segmentado"
import { aCentavos, aTextoEditable, formatearMonto } from "@/lib/dinero"
import { LO_PAGUE_YO, type ValorPagadores } from "@/lib/pagadores"
import { cn } from "@/lib/utils"

// "¿Quién pagó?" de un gasto compartido (0032). Por defecto lo pagó entero
// quien lo carga, como siempre. "Entre varios" reparte el total entre lo que
// puse yo, lo que pusieron otros miembros y la cuenta conjunta. A cada miembro
// que puso le llega para confirmar de qué cuenta salió.

type Modo = "yo" | "varios"

interface Fila {
  clave: string
  nombre: string
  user_id: string | null
  account_id: string | null
}

export function EditorPagadores({
  total,
  moneda,
  yoId,
  miembros,
  conjunta,
  inicial,
  estados,
  onCambio,
}: {
  total: number
  moneda: string
  yoId: string
  miembros: { user_id: string; nombre: string }[]
  conjunta: { id: string; nombre: string } | null
  inicial?: ValorPagadores
  // Como respondió cada miembro (clave = user_id): para verlo al editar.
  estados?: Record<string, string>
  onCambio: (v: ValorPagadores) => void
}) {
  const filas: Fila[] = [
    { clave: "yo", nombre: "Vos", user_id: null, account_id: null },
    ...miembros
      .filter((m) => m.user_id !== yoId)
      .map((m) => ({ clave: m.user_id, nombre: m.nombre, user_id: m.user_id, account_id: null })),
    ...(conjunta
      ? [{ clave: conjunta.id, nombre: conjunta.nombre, user_id: null, account_id: conjunta.id }]
      : []),
  ]
  const [modo, setModo] = useState<Modo>(inicial && inicial.mio !== null ? "varios" : "yo")
  const [textos, setTextos] = useState<Record<string, string>>(() => {
    const t: Record<string, string> = {}
    if (inicial && inicial.mio !== null) {
      t.yo = aTextoEditable(inicial.mio, moneda)
      for (const o of inicial.otros)
        t[o.user_id ?? o.account_id ?? ""] = aTextoEditable(o.amount, moneda)
    }
    return t
  })

  const montos = Object.fromEntries(
    filas.map((f) => [f.clave, textos[f.clave] ? (aCentavos(textos[f.clave], moneda) ?? -1) : 0]),
  )
  const suma = filas.reduce((s, f) => s + Math.max(0, montos[f.clave]), 0)
  const algunoMal = filas.some((f) => montos[f.clave] < 0)
  const otrosPositivos = filas.some((f) => f.clave !== "yo" && montos[f.clave] > 0)
  const falta = total - suma

  useEffect(() => {
    if (modo === "yo") {
      onCambio(LO_PAGUE_YO)
      return
    }
    onCambio({
      mio: Math.max(0, montos.yo),
      otros: filas
        .filter((f) => f.clave !== "yo" && montos[f.clave] > 0)
        .map((f) => ({ user_id: f.user_id, account_id: f.account_id, amount: montos[f.clave] })),
      valido: !algunoMal && falta === 0 && otrosPositivos,
    })
    // Se avisa cuando cambia lo que se tipeo, el modo o el total.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modo, JSON.stringify(textos), total])

  return (
    <section className="space-y-3">
      <h2 className="text-sm text-muted-foreground">¿Quién pagó?</h2>
      <Segmentado
        opciones={[
          { valor: "yo", etiqueta: "Lo pagué yo" },
          { valor: "varios", etiqueta: "Entre varios" },
        ]}
        valor={modo}
        onCambio={setModo}
        etiqueta="Quién pagó"
      />
      {modo === "varios" && (
        <div className="space-y-2">
          {filas.map((f) => {
            const id = `pago-${f.clave}`
            const estado = f.user_id ? estados?.[f.user_id] : undefined
            return (
              <div key={f.clave} className="flex items-center gap-3">
                <label htmlFor={id} className="min-w-0 flex-1 text-sm">
                  <span className="block truncate">{f.nombre}</span>
                  {estado && (
                    <span
                      className={cn(
                        "block text-xs",
                        estado === "rejected" ? "text-destructive" : "text-muted-foreground",
                      )}
                    >
                      {estado === "confirmed"
                        ? "Confirmó"
                        : estado === "rejected"
                          ? "Dice que no pagó"
                          : "Falta que confirme"}
                    </span>
                  )}
                </label>
                <Input
                  id={id}
                  value={textos[f.clave] ?? ""}
                  onChange={(e) => setTextos((t) => ({ ...t, [f.clave]: e.target.value }))}
                  inputMode="decimal"
                  placeholder="0"
                  aria-invalid={montos[f.clave] < 0 || undefined}
                  className="tabular w-32 text-right"
                />
              </div>
            )
          })}
          <p
            role="status"
            className={cn("text-xs", falta === 0 ? "text-muted-foreground" : "text-destructive")}
          >
            {algunoMal
              ? "Hay un monto que no se entiende."
              : falta > 0
                ? `Falta asignar ${formatearMonto(falta, { moneda })}.`
                : falta < 0
                  ? `Sobran ${formatearMonto(-falta, { moneda })}.`
                  : otrosPositivos
                    ? "Cierra con el total."
                    : "Poné cuánto puso alguien más."}
          </p>
        </div>
      )}
    </section>
  )
}
