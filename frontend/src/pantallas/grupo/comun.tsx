import { Users } from "lucide-react"

import { Vacio } from "@/componentes/Vacio"
import { Cargando, Esqueleto, useDemora } from "@/componentes/ui/cargando"

// Lo que muestran las pantallas de un grupo (0026) mientras carga o si no es (o
// ya no es) uno de mis grupos. El grupo de la URL sale de `useGrupoDeRuta`.

export function CargandoGrupo() {
  const visible = useDemora(true)
  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4">
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
