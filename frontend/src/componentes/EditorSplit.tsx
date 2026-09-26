import { useEffect, useMemo, useState } from "react"

import { Campo } from "@/componentes/ui/campo"
import { Input } from "@/componentes/ui/input"
import { Segmentado } from "@/componentes/ui/segmentado"
import { aCentavos, formatearMonto } from "@/lib/dinero"
import { cn } from "@/lib/utils"

// Editor de reparto de un gasto compartido (fase 3b.3, ver 0015). Tres modos:
//   - igual: se elige quienes participan; el total se parte igual entre ellos.
//   - exacto: un monto por persona; deben sumar el total.
//   - porcentaje: un % por persona; deben sumar 100.
// Reporta al padre el reparto resuelto en centavos (o `null` = "igual entre
// todos", el default, que no guarda filas) y si es valido (suma el total).

export interface ParteSplit {
  user_id: string
  amount: number
}
export interface MiembroSplit {
  user_id: string
  nombre: string
}
export interface ValorSplit {
  splits: ParteSplit[] | null
  valido: boolean
}

type Modo = "igual" | "exacto" | "porcentaje"
const MODOS: { valor: Modo; etiqueta: string }[] = [
  { valor: "igual", etiqueta: "Igual" },
  { valor: "exacto", etiqueta: "Exacto" },
  { valor: "porcentaje", etiqueta: "%" },
]

// Reparte `total` en `n` partes enteras que suman `total` (resto de a un centavo).
function repartir(total: number, n: number): number[] {
  if (n <= 0) return []
  const base = Math.floor(total / n)
  const resto = total - base * n
  return Array.from({ length: n }, (_, i) => base + (i < resto ? 1 : 0))
}

export function EditorSplit({
  total,
  currency,
  miembros,
  inicial,
  onCambio,
}: {
  total: number
  currency: string
  miembros: MiembroSplit[]
  // Splits ya guardados (editar). null/undefined = igual entre todos.
  inicial?: ParteSplit[] | null
  onCambio: (v: ValorSplit) => void
}) {
  const [modo, setModo] = useState<Modo>("igual")
  // Igual: quienes participan (por defecto, todos).
  const [incluidos, setIncluidos] = useState<Set<string>>(new Set(miembros.map((m) => m.user_id)))
  // Exacto/porcentaje: texto por miembro.
  const [montos, setMontos] = useState<Record<string, string>>({})
  const [pcts, setPcts] = useState<Record<string, string>>({})

  // Sembrar desde `inicial` una sola vez (editar un gasto ya dividido).
  const [sembrado, setSembrado] = useState(false)
  useEffect(() => {
    if (sembrado || !inicial || inicial.length === 0 || miembros.length === 0) return
    setSembrado(true)
    setModo("exacto")
    const m: Record<string, string> = {}
    for (const s of inicial) m[s.user_id] = (s.amount / 100).toString().replace(".", ",")
    setMontos(m)
    setIncluidos(new Set(inicial.map((s) => s.user_id)))
  }, [inicial, miembros, sembrado])

  const { splits, valido, sumaExacto, sumaPct } = useMemo((): ValorSplit & {
    sumaExacto: number
    sumaPct: number
  } => {
    if (modo === "igual") {
      const part = miembros.filter((m) => incluidos.has(m.user_id))
      if (part.length === 0) return { splits: null, valido: false, sumaExacto: 0, sumaPct: 0 }
      // Igual entre TODOS: es el default, no se guardan filas.
      if (part.length === miembros.length)
        return { splits: null, valido: true, sumaExacto: total, sumaPct: 100 }
      const partes = repartir(total, part.length)
      return {
        splits: part.map((m, i) => ({ user_id: m.user_id, amount: partes[i] })),
        valido: true,
        sumaExacto: total,
        sumaPct: 100,
      }
    }
    if (modo === "exacto") {
      const arr = miembros.map((m) => ({
        user_id: m.user_id,
        amount: montos[m.user_id]?.trim() ? (aCentavos(montos[m.user_id], currency) ?? 0) : 0,
      }))
      const suma = arr.reduce((s, x) => s + x.amount, 0)
      return {
        splits: arr.filter((x) => x.amount > 0),
        valido: suma === total && total > 0,
        sumaExacto: suma,
        sumaPct: 100,
      }
    }
    // porcentaje: se resuelve a centavos, con el resto al primero para cerrar.
    const pares = miembros.map((m) => ({
      user_id: m.user_id,
      pct: pcts[m.user_id]?.trim() ? Number(pcts[m.user_id].replace(",", ".")) : 0,
    }))
    const sumaPct = pares.reduce((s, x) => s + x.pct, 0)
    let acumulado = 0
    const arr = pares.map((p, i) => {
      const amount =
        i === pares.length - 1 ? total - acumulado : Math.round((total * p.pct) / 100)
      acumulado += amount
      return { user_id: p.user_id, amount }
    })
    return {
      splits: arr.filter((x) => x.amount > 0),
      valido: Math.abs(sumaPct - 100) < 0.01 && total > 0,
      sumaExacto: total,
      sumaPct,
    }
  }, [modo, incluidos, montos, pcts, miembros, total, currency])

  // Avisar al padre cada vez que cambia el resultado.
  useEffect(() => {
    onCambio({ splits, valido })
  }, [splits, valido, onCambio])

  if (miembros.length < 2) return null

  return (
    <Campo etiqueta="Dividir entre">
      <div className="space-y-2">
        <Segmentado opciones={MODOS} valor={modo} onCambio={setModo} />

        <div className="space-y-1.5">
          {miembros.map((m) => (
            <div key={m.user_id} className="flex items-center gap-2">
              {modo === "igual" ? (
                <label className="flex flex-1 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={incluidos.has(m.user_id)}
                    onChange={(e) =>
                      setIncluidos((prev) => {
                        const s = new Set(prev)
                        if (e.target.checked) s.add(m.user_id)
                        else s.delete(m.user_id)
                        return s
                      })
                    }
                    className="h-4 w-4"
                  />
                  <span className="truncate">{m.nombre}</span>
                </label>
              ) : (
                <>
                  <span className="flex-1 truncate text-sm">{m.nombre}</span>
                  <Input
                    value={(modo === "exacto" ? montos : pcts)[m.user_id] ?? ""}
                    onChange={(e) => {
                      const v = e.target.value
                      if (modo === "exacto") setMontos((p) => ({ ...p, [m.user_id]: v }))
                      else setPcts((p) => ({ ...p, [m.user_id]: v }))
                    }}
                    inputMode="decimal"
                    placeholder={modo === "exacto" ? "0" : "0%"}
                    className="tabular h-8 w-24 text-right"
                  />
                </>
              )}
            </div>
          ))}
        </div>

        {/* Chequeo de que cierra */}
        {modo === "exacto" && (
          <p className={cn("text-xs", valido ? "text-muted-foreground" : "text-destructive")}>
            {formatearMonto(sumaExacto, { moneda: currency })} de{" "}
            {formatearMonto(total, { moneda: currency })}
            {!valido && " — tiene que dar el total"}
          </p>
        )}
        {modo === "porcentaje" && (
          <p className={cn("text-xs", valido ? "text-muted-foreground" : "text-destructive")}>
            {sumaPct.toFixed(0)}% de 100%{!valido && " — tiene que sumar 100%"}
          </p>
        )}
        {modo === "igual" && incluidos.size === 0 && (
          <p className="text-xs text-destructive">Elegí al menos a una persona.</p>
        )}
      </div>
    </Campo>
  )
}
