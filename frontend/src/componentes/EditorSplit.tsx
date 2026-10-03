import { useEffect, useMemo, useState } from "react"

import { Campo } from "@/componentes/ui/campo"
import { Input } from "@/componentes/ui/input"
import { Interruptor } from "@/componentes/ui/interruptor"
import { Segmentado } from "@/componentes/ui/segmentado"
import { aCentavos, aTextoEditable, formatearMonto } from "@/lib/dinero"
import { aCentesimas, aPartes, repartirPorPesos } from "@/lib/reparto"
import { cn } from "@/lib/utils"

// Editor de reparto de un gasto compartido (fase 3b.3 y 0026), como Splitwise.
// Cuatro modos:
//   - igual: se elige quienes participan; el total se parte igual entre ellos.
//   - exacto: un monto por persona; deben sumar el total.
//   - porcentaje: un % por persona; deben sumar 100.
//   - partes: cuantas partes le tocan a cada uno (2 a 1 para quien vale por dos).
// Reporta al padre el reparto resuelto en centavos (o `null` = "igual entre
// todos", el default, que no guarda filas) y si es valido (suma el total).
// Los porcentajes y las partes se resuelven en enteros (lib/reparto).

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

type Modo = "igual" | "exacto" | "porcentaje" | "partes"
const MODOS: { valor: Modo; etiqueta: string }[] = [
  { valor: "igual", etiqueta: "Igual" },
  { valor: "exacto", etiqueta: "Exacto" },
  { valor: "porcentaje", etiqueta: "%" },
  { valor: "partes", etiqueta: "Partes" },
]

export function EditorSplit({
  total,
  currency,
  miembros,
  inicial,
  partesIniciales,
  onCambio,
}: {
  total: number
  currency: string
  miembros: MiembroSplit[]
  // Splits ya guardados (editar). null/undefined = igual entre todos.
  inicial?: ParteSplit[] | null
  // El reparto por defecto del grupo (partes por miembro): con el, un gasto
  // nuevo arranca en "Partes" ya cargado (Casa 60/40).
  partesIniciales?: Record<string, number> | null
  onCambio: (v: ValorSplit) => void
}) {
  const [modo, setModo] = useState<Modo>("igual")
  // Igual: a quienes se SACA del reparto. Se guardan los excluidos y no los
  // incluidos a proposito: los miembros llegan de una consulta, y un "todos"
  // armado al montar quedaba vacio si todavia no habian llegado (el editor
  // arrancaba con nadie elegido y un error). Vacio = todos, siempre.
  const [excluidos, setExcluidos] = useState<Set<string>>(new Set())
  // Exacto, porcentaje y partes: el texto de cada miembro.
  const [montos, setMontos] = useState<Record<string, string>>({})
  const [pcts, setPcts] = useState<Record<string, string>>({})
  const [partes, setPartes] = useState<Record<string, string>>({})

  // Sembrar una sola vez: lo ya guardado (editar) o el reparto del grupo.
  const [sembrado, setSembrado] = useState(false)
  useEffect(() => {
    if (sembrado || miembros.length === 0) return
    if (inicial && inicial.length > 0) {
      setSembrado(true)
      setModo("exacto")
      const m: Record<string, string> = {}
      for (const s of inicial) m[s.user_id] = aTextoEditable(s.amount, currency)
      setMontos(m)
      setExcluidos(
        new Set(
          miembros
            .filter((x) => !inicial.some((s) => s.user_id === x.user_id))
            .map((x) => x.user_id),
        ),
      )
    } else if (partesIniciales) {
      setSembrado(true)
      setModo("partes")
      // Quien entro al grupo despues de fijar el reparto arranca con 0: se ve
      // y se corrige aca mismo.
      setPartes(
        Object.fromEntries(
          miembros.map((m) => [m.user_id, String(partesIniciales[m.user_id] ?? 0)]),
        ),
      )
    }
  }, [inicial, partesIniciales, miembros, sembrado, currency])

  // El orden para repartir los centavos sueltos: el mismo que usa el balance
  // para el "igual" por defecto (por id), asi lo que se ve es lo que se guarda.
  const ordenados = useMemo(
    () => [...miembros].sort((a, b) => a.user_id.localeCompare(b.user_id)),
    [miembros],
  )

  const resultado = useMemo((): ValorSplit & {
    porMiembro: Map<string, number>
    sumaExacto: number
    sumaPct: number
  } => {
    const porMiembro = new Map<string, number>()
    const conPesos = (pesos: number[]) => {
      const reparto = repartirPorPesos(total, pesos)
      ordenados.forEach((m, i) => porMiembro.set(m.user_id, reparto[i]))
      // Todos con el mismo peso es "igual entre todos": el default, sin filas.
      const todosIgual = pesos.every((p) => p > 0 && p === pesos[0])
      return todosIgual
        ? null
        : ordenados
            .map((m, i) => ({ user_id: m.user_id, amount: reparto[i] }))
            .filter((x) => x.amount > 0)
    }

    if (modo === "igual") {
      const pesos = ordenados.map((m) => (excluidos.has(m.user_id) ? 0 : 1))
      const alguien = pesos.some((p) => p > 0)
      const splits = conPesos(pesos)
      return { splits, valido: alguien, porMiembro, sumaExacto: total, sumaPct: 10000 }
    }
    if (modo === "exacto") {
      const arr = ordenados.map((m) => ({
        user_id: m.user_id,
        amount: montos[m.user_id]?.trim() ? (aCentavos(montos[m.user_id], currency) ?? 0) : 0,
      }))
      for (const x of arr) porMiembro.set(x.user_id, x.amount)
      const suma = arr.reduce((s, x) => s + x.amount, 0)
      return {
        splits: arr.filter((x) => x.amount > 0),
        valido: suma === total && total > 0,
        porMiembro,
        sumaExacto: suma,
        sumaPct: 10000,
      }
    }
    if (modo === "porcentaje") {
      const leidos = ordenados.map((m) =>
        pcts[m.user_id]?.trim() ? aCentesimas(pcts[m.user_id]) : 0,
      )
      const pesos = leidos.map((p) => p ?? 0)
      const sumaPct = pesos.reduce((s, p) => s + p, 0)
      const splits = conPesos(pesos)
      return {
        splits,
        valido: leidos.every((p) => p !== null) && sumaPct === 10000 && total > 0,
        porMiembro,
        sumaExacto: total,
        sumaPct,
      }
    }
    // partes
    const leidos = ordenados.map((m) =>
      partes[m.user_id]?.trim() ? aPartes(partes[m.user_id]) : 0,
    )
    const pesos = leidos.map((p) => p ?? 0)
    const splits = conPesos(pesos)
    return {
      splits,
      valido: leidos.every((p) => p !== null) && pesos.some((p) => p > 0) && total > 0,
      porMiembro,
      sumaExacto: total,
      sumaPct: 10000,
    }
  }, [modo, excluidos, montos, pcts, partes, ordenados, total, currency])
  const { splits, valido, porMiembro, sumaExacto, sumaPct } = resultado

  // Avisar al padre cada vez que cambia el resultado.
  useEffect(() => {
    onCambio({ splits, valido })
  }, [splits, valido, onCambio])

  if (miembros.length < 2) return null

  // Al pasar a Partes sin nada escrito, cada uno arranca con 1, como en
  // Splitwise: de ahi se sube a quien vale por dos.
  function cambiarModo(m: Modo) {
    if (m === "partes" && Object.values(partes).every((t) => !t.trim()))
      setPartes(Object.fromEntries(miembros.map((x) => [x.user_id, "1"])))
    setModo(m)
  }

  const textoDe = modo === "exacto" ? montos : modo === "porcentaje" ? pcts : partes
  // Quien tiene 0 partes o 0 %, por lo que se escribio (no por el monto, que
  // con un total chico puede redondear a 0 sin que la persona este afuera).
  const pesoEscrito = (id: string) =>
    modo === "partes"
      ? (aPartes(partes[id] ?? "") ?? 0)
      : modo === "porcentaje"
        ? (aCentesimas(pcts[id] ?? "") ?? 0)
        : 1
  const afuera = miembros.filter((m) => pesoEscrito(m.user_id) === 0).map((m) => m.nombre)
  const ponerTexto = modo === "exacto" ? setMontos : modo === "porcentaje" ? setPcts : setPartes

  return (
    <Campo etiqueta="Dividir entre">
      <div className="space-y-2">
        <Segmentado opciones={MODOS} valor={modo} onCambio={cambiarModo} etiqueta="Cómo dividir" />

        <div className="space-y-2">
          {miembros.map((m) => (
            <div key={m.user_id} className="flex min-h-11 items-center gap-3">
              {/* El nombre y, salvo en Exacto (donde se escribe), lo que le toca. */}
              <span className="min-w-0 flex-1 text-sm">
                <span className="block truncate">{m.nombre}</span>
                {modo !== "exacto" && total > 0 && (
                  <span className="tabular block text-xs text-muted-foreground">
                    {formatearMonto(porMiembro.get(m.user_id) ?? 0, { moneda: currency })}
                  </span>
                )}
              </span>
              {modo === "igual" ? (
                // Binario y por fila: Interruptor, no checkbox (DESIGN.md 7).
                <Interruptor
                  encendido={!excluidos.has(m.user_id)}
                  etiqueta={`Incluir a ${m.nombre}`}
                  onCambio={(incluir) =>
                    setExcluidos((prev) => {
                      const s = new Set(prev)
                      if (incluir) s.delete(m.user_id)
                      else s.add(m.user_id)
                      return s
                    })
                  }
                />
              ) : (
                <Input
                  aria-label={
                    modo === "exacto"
                      ? `Monto de ${m.nombre}`
                      : modo === "porcentaje"
                        ? `Porcentaje de ${m.nombre}`
                        : `Partes de ${m.nombre}`
                  }
                  value={textoDe[m.user_id] ?? ""}
                  onChange={(e) => {
                    const v = e.target.value
                    ponerTexto((p) => ({ ...p, [m.user_id]: v }))
                  }}
                  inputMode={modo === "partes" ? "numeric" : "decimal"}
                  placeholder={modo === "exacto" ? "0" : modo === "porcentaje" ? "0%" : "0"}
                  className="tabular w-24 text-right"
                />
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
            {formatearCentesimas(sumaPct)}% de 100%{!valido && " — tiene que sumar 100%"}
          </p>
        )}
        {/* Quien tiene 0 no paga nada de este gasto: se dice, no se deduce del
            "$ 0,00" (p. ej., alguien que entro al grupo despues de fijar el
            reparto por defecto, que arranca con 0). */}
        {(modo === "partes" || modo === "porcentaje") && valido && afuera.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {afuera.join(" y ")} {afuera.length === 1 ? "queda" : "quedan"} afuera de este gasto.
          </p>
        )}
        {modo === "partes" && !valido && (
          <p className="text-xs text-destructive">Poné al menos una parte, en números enteros.</p>
        )}
        {modo === "igual" && !valido && (
          <p className="text-xs text-destructive">Elegí al menos a una persona.</p>
        )}
      </div>
    </Campo>
  )
}

// 3333 -> "33,33"; 5000 -> "50".
function formatearCentesimas(c: number): string {
  const entero = Math.floor(c / 100)
  const dec = c % 100
  return dec === 0 ? String(entero) : `${entero},${String(dec).padStart(2, "0")}`
}
