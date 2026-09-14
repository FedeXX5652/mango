import { useMemo } from "react"

import { SelectorEntidad } from "@/componentes/SelectorEntidad"
import { ordenarJerarquico } from "@/lib/categorias"

export interface CategoriaElegible {
  id: string
  name: string
  parent_id: string | null
  icon: string | null
}

// La categoria de un movimiento: un caso de `SelectorEntidad` con el orden y la
// sangria de la jerarquia.
//
// El orden sale de `ordenarJerarquico`: padres alfabeticos y, dentro de cada
// uno, sus hijas alfabeticas, comparando en español. Es el mismo que usa la
// pantalla de categorias, que es donde uno las conoce.
export function SelectorCategoria({
  categorias,
  valor,
  onCambio,
  placeholder = "Elegí una categoría",
  vacio,
}: {
  categorias: CategoriaElegible[]
  valor: string
  onCambio: (id: string) => void
  placeholder?: string
  vacio?: string
}) {
  const opciones = useMemo(() => {
    const nombreDe = new Map(categorias.map((c) => [c.id, c.name]))
    return ordenarJerarquico(categorias).map((c) => ({
      id: c.id,
      nombre: c.name,
      // La madre, para que "Restaurante" no quede ambiguo cuando el campo esta
      // cerrado. Dentro de la lista no hace falta: la sangria ya lo dice.
      detalle: c.parent_id ? (nombreDe.get(c.parent_id) ?? null) : null,
      icono: c.icon,
      sangria: Boolean(c.parent_id),
    }))
  }, [categorias])

  return (
    <SelectorEntidad
      opciones={opciones}
      valor={valor}
      onCambio={onCambio}
      titulo="Categoría"
      placeholder={placeholder}
      vacio={vacio}
    />
  )
}
