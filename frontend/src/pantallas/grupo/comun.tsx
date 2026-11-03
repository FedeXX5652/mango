import { Users } from "lucide-react"
import type { ReactNode } from "react"

import { Vacio } from "@/componentes/Vacio"
import { Cargando, Esqueleto, useDemora } from "@/componentes/ui/cargando"
import { type GrupoInfo, useGrupoDeRuta } from "@/hooks/useEspacio"

// Lo que muestran las pantallas de un grupo (0026) mientras carga o si no es (o
// ya no es) uno de mis grupos. El grupo de la URL sale de `useGrupoDeRuta`.

export function CargandoGrupo() {
  const visible = useDemora(true)
  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <Cargando visible={visible} className="space-y-4" etiqueta="Cargando grupo">
        <Esqueleto className="h-11 w-40 rounded-full" />
        <Esqueleto className="h-32 w-full rounded-xl" />
        <Esqueleto className="h-48 w-full rounded-xl" />
      </Cargando>
    </div>
  )
}

export function GrupoNoEncontrado() {
  return (
    <div className="mx-auto max-w-xl p-4">
      <Vacio
        icono={Users}
        titulo="Este grupo no está"
        detalle="Puede que te hayan sacado o que todavía no haya bajado. Revisá tus grupos."
        accion={{ to: "/grupos", etiqueta: "Ver mis grupos" }}
      />
    </div>
  )
}

// Una pantalla que es la misma en Personal y en un grupo (1.15.0: plantillas,
// recurrentes, metas): `/metas` y `/grupos/<grupo>/metas`. Fuera de un grupo,
// `null`; dentro, espera al grupo de la URL.
export function DelEspacio({ children }: { children: (grupo: GrupoInfo | null) => ReactNode }) {
  const { id, grupo, cargando } = useGrupoDeRuta()
  if (!id) return children(null)
  if (cargando) return <CargandoGrupo />
  if (!grupo) return <GrupoNoEncontrado />
  return children(grupo)
}
