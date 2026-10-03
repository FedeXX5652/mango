import { useQuery } from "@powersync/react"
import { Check, ChevronDown } from "lucide-react"
import { useState } from "react"

import { PuntoEspacio } from "@/componentes/PuntoEspacio"
import { Hoja } from "@/componentes/ui/hoja"
import { FilaInset, ListaInset } from "@/componentes/ui/listaInset"
import { SIN_COLOR } from "@/lib/paleta"

// En que espacio queda un movimiento (0026): Personal (privado) o un grupo
// (compartido). El formulario lo dice siempre —"Se carga en ● Casa"— para que
// no se cargue algo en el espacio equivocado sin darse cuenta; el alta arranca
// en el espacio desde el que se toco el "+".
//
// `valor` es el group_id o "" (Personal). Sin grupos no se dibuja: no hay donde
// mas cargarlo. Lo que viaja al grupo es el movimiento con su categoria y tags;
// la cuenta y el medio de pago quedan privados siempre (lo garantiza la sync).

interface GrupoFila {
  id: string
  name: string
  color: string | null
}

export function EspacioDelMovimiento({
  valor,
  onCambio,
}: {
  valor: string
  onCambio: (groupId: string) => void
}) {
  const [abierta, setAbierta] = useState(false)
  const { data: grupos } = useQuery<GrupoFila>(
    "SELECT id, name, color FROM groups WHERE deleted_at IS NULL ORDER BY name",
  )
  if (grupos.length === 0) return null

  const actual = grupos.find((g) => g.id === valor)
  const nombre = actual?.name ?? "Personal"

  function elegir(id: string) {
    setAbierta(false)
    onCambio(id)
  }

  return (
    <>
      <div className="flex min-w-0 items-center gap-2">
        <span className="shrink-0 text-sm text-muted-foreground">Se carga en</span>
        <button
          type="button"
          onClick={() => setAbierta(true)}
          aria-haspopup="dialog"
          aria-label={`Se carga en ${nombre}. Cambiar`}
          className="inline-flex min-h-11 min-w-0 items-center gap-2 rounded-full border border-border bg-card px-3 text-sm font-semibold transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <PuntoEspacio color={actual ? (actual.color ?? SIN_COLOR) : null} />
          <span className="min-w-0 truncate">{nombre}</span>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        </button>
      </div>

      <Hoja abierta={abierta} onOpenChange={setAbierta} titulo="¿Dónde se carga?">
        <ListaInset>
          <FilaInset onClick={() => elegir("")}>
            <span className="flex min-w-0 items-center gap-3">
              <PuntoEspacio color={null} />
              <span className="min-w-0">
                <span className="block truncate font-medium">Personal</span>
                <span className="block text-xs text-muted-foreground">Solo lo ves vos</span>
              </span>
            </span>
            {!actual && <Check className="h-4 w-4 shrink-0 text-enlace" aria-label="Actual" />}
          </FilaInset>
          {grupos.map((g) => (
            <FilaInset key={g.id} onClick={() => elegir(g.id)}>
              <span className="flex min-w-0 items-center gap-3">
                <PuntoEspacio color={g.color ?? SIN_COLOR} />
                <span className="min-w-0">
                  <span className="block truncate font-medium">{g.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    Compartido con el grupo
                  </span>
                </span>
              </span>
              {actual?.id === g.id && (
                <Check className="h-4 w-4 shrink-0 text-enlace" aria-label="Actual" />
              )}
            </FilaInset>
          ))}
        </ListaInset>
      </Hoja>
    </>
  )
}
