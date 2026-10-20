import { BotonNuevo, EncabezadoPantalla } from "@/componentes/EncabezadoPantalla"
import { GestorEtiquetas } from "@/componentes/GestorEtiquetas"
import { useVolver } from "@/hooks/useVolver"

// Las etiquetas personales. Las de un grupo se administran en Ajustes del grupo
// (1.7.0).
export function Etiquetas() {
  // A donde se vino (Inicio, Accesos, Ajustes o un atajo), no a un lugar fijo.
  const volver = useVolver("/ajustes")
  return (
    <div className="mx-auto max-w-xl space-y-4 p-4">
      <GestorEtiquetas
        encabezado={(nueva) => (
          <>
            <EncabezadoPantalla
              titulo="Etiquetas"
              volver={volver}
              acciones={<BotonNuevo etiqueta="Nueva etiqueta" onClick={nueva} />}
            />
            <p className="text-sm text-muted-foreground">
              La etiqueta dice a qué <strong>proyecto</strong> pertenece un gasto (un viaje, una
              refacción). Es otra dimensión que la categoría: un gasto puede tener varias o ninguna.
            </p>
          </>
        )}
      />
    </div>
  )
}
