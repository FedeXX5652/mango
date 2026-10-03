import { useQuery } from "@powersync/react"
import { useMemo, useState } from "react"

import { Button } from "@/componentes/ui/button"
import { Input } from "@/componentes/ui/input"
import { FilaInset, ListaInset } from "@/componentes/ui/listaInset"
import { Segmentado } from "@/componentes/ui/segmentado"
import type { MiembroGrupo } from "@/lib/grupo"
import { ApiError, api } from "@/lib/api"
import { aPartes, leerReparto } from "@/lib/reparto"

// Reparto por defecto del grupo (0026), como Splitwise: con cuantas partes
// arranca cada miembro en un gasto nuevo (Casa 60/40, o 2 a 1). Cada gasto se
// puede cambiar al cargarlo; esto es solo el punto de partida. Lo edita
// cualquier miembro, como el nombre y el color. Se escribe por API y baja por la
// sync.

type Modo = "iguales" | "partes"
const MODOS: { valor: Modo; etiqueta: string }[] = [
  { valor: "iguales", etiqueta: "Partes iguales" },
  { valor: "partes", etiqueta: "Por partes" },
]

export function RepartoDelGrupo({
  groupId,
  miembros,
  nombre,
}: {
  groupId: string
  miembros: MiembroGrupo[]
  nombre: (userId: string) => string
}) {
  const { data } = useQuery<{ default_split: string | null }>(
    "SELECT default_split FROM groups WHERE id = ?",
    [groupId],
  )
  const guardado = useMemo(() => leerReparto(data[0]?.default_split), [data])

  // Lo que se esta editando; null = se muestra lo guardado.
  const [modo, setModo] = useState<Modo | null>(null)
  const [textos, setTextos] = useState<Record<string, string> | null>(null)
  const [estado, setEstado] = useState<"" | "guardando" | "guardado">("")
  const [error, setError] = useState("")

  const modoActual: Modo = modo ?? (guardado ? "partes" : "iguales")
  const textosActuales =
    textos ??
    Object.fromEntries(miembros.map((m) => [m.user_id, String(guardado?.[m.user_id] ?? 1)]))

  const partes = miembros.map((m) => aPartes(textosActuales[m.user_id] ?? ""))
  const suma = partes.reduce<number>((s, p) => s + (p ?? 0), 0)
  const valido = modoActual === "iguales" || (partes.every((p) => p !== null) && suma > 0)
  const cambiado = modo !== null || textos !== null

  async function guardar() {
    if (!valido) return
    setEstado("guardando")
    setError("")
    const default_split =
      modoActual === "iguales"
        ? null
        : Object.fromEntries(miembros.map((m, i) => [m.user_id, partes[i] ?? 0]))
    try {
      await api.editarGrupo(groupId, { default_split })
      setModo(null)
      setTextos(null)
      setEstado("guardado")
    } catch (e) {
      setEstado("")
      setError(
        e instanceof ApiError && e.status === 422
          ? e.detalle
          : "No se pudo guardar. ¿Hay conexión?",
      )
    }
  }

  return (
    <section id="reparto" className="scroll-mt-4 space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground">Reparto por defecto</h2>
        <p className="text-xs text-muted-foreground">
          Con esto arranca cada gasto nuevo del grupo. Al cargarlo se puede cambiar.
        </p>
      </div>
      <Segmentado
        etiqueta="Reparto por defecto"
        opciones={MODOS}
        valor={modoActual}
        onCambio={(m) => {
          setModo(m)
          setEstado("")
        }}
      />
      {modoActual === "partes" && (
        <ListaInset>
          {miembros.map((m, i) => (
            <FilaInset key={m.user_id}>
              <span className="min-w-0 text-sm">
                <span className="block truncate">{nombre(m.user_id)}</span>
                {/* El porcentaje que resulta: 60 y 40 partes, o 3 y 2, son 60/40. */}
                {suma > 0 && partes[i] !== null && (
                  <span className="tabular block text-xs text-muted-foreground">
                    {Math.round(((partes[i] ?? 0) * 100) / suma)}%
                  </span>
                )}
              </span>
              <Input
                aria-label={`Partes de ${nombre(m.user_id)}`}
                value={textosActuales[m.user_id] ?? ""}
                onChange={(e) => {
                  setTextos({ ...textosActuales, [m.user_id]: e.target.value })
                  setEstado("")
                }}
                inputMode="numeric"
                className="tabular w-24 text-right"
              />
            </FilaInset>
          ))}
        </ListaInset>
      )}
      {modoActual === "partes" && !valido && (
        <p className="text-xs text-destructive">Poné al menos una parte, en números enteros.</p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {(cambiado || estado === "guardado") && (
        <div className="flex items-center gap-3">
          <Button onClick={guardar} disabled={!valido || !cambiado || estado === "guardando"}>
            {estado === "guardando" ? "Guardando…" : "Guardar reparto"}
          </Button>
          {estado === "guardado" && !cambiado && (
            <span role="status" className="text-sm text-muted-foreground">
              Guardado
            </span>
          )}
        </div>
      )}
    </section>
  )
}
