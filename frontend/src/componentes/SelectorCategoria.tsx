import { useQuery } from "@powersync/react"
import { useMemo } from "react"

import { type OpcionEntidad, SelectorEntidad } from "@/componentes/SelectorEntidad"
import { ordenarJerarquico } from "@/lib/categorias"

export interface CategoriaElegible {
  id: string
  name: string
  parent_id: string | null
  icon: string | null
}

// Cuantas van en "Frecuentes", y desde cuantas categorias aparece: con pocas
// estan todas a la vista.
const MAX_FRECUENTES = 6
const MINIMO_FRECUENTES = 8

// Cuantas veces se uso cada categoria en el ultimo año: lo propio y lo de mis
// grupos (cada categoria es de un solo espacio, asi que no se mezclan).
const SQL_USO = `SELECT category_id AS id, COUNT(*) AS n FROM (
    SELECT category_id, occurred_at FROM transactions WHERE deleted_at IS NULL AND group_id IS NULL
    UNION ALL
    SELECT category_id, occurred_at FROM group_transactions WHERE deleted_at IS NULL
  ) WHERE category_id IS NOT NULL AND occurred_at >= date('now', '-365 days')
  GROUP BY category_id`

// La categoria de un movimiento: un caso de `SelectorEntidad`, el mismo en todos
// lados (alta, detalle, plantillas, recurrentes, topes).
//
// El orden sale de `ordenarJerarquico`: padres alfabeticos y, dentro de cada
// uno, sus hijas alfabeticas, comparando en español. Es el mismo que usa la
// pantalla de categorias, que es donde uno las conoce.
//
// Desde la 1.14.0 una madre con hijas es el titulo de su seccion, no una opcion
// mas entre sus hijas (se tocaba sin querer): se elige a proposito con
// "Comida (en general)", al final de la seccion. Arriba, las mas usadas.
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
  const { data: uso } = useQuery<{ id: string; n: number }>(SQL_USO)

  const opciones = useMemo(() => {
    const nombreDe = new Map(categorias.map((c) => [c.id, c.name]))
    const conHijas = new Set(categorias.map((c) => c.parent_id).filter(Boolean))
    const salida: OpcionEntidad[] = []
    const ordenadas = ordenarJerarquico(categorias)
    ordenadas.forEach((c, i) => {
      const madre = c.parent_id ? (nombreDe.get(c.parent_id) ?? null) : null
      if (conHijas.has(c.id)) {
        salida.push({ id: `titulo:${c.id}`, nombre: c.name, titulo: true })
      } else {
        // La madre, para que "Restaurantes" no quede ambiguo con el campo
        // cerrado; en la lista no se muestra (ya esta en el titulo).
        salida.push({ id: c.id, nombre: c.name, detalle: madre, icono: c.icon, sangria: !!madre })
      }
      // Cerrando la seccion de una madre: ella misma, a proposito.
      const siguiente = ordenadas[i + 1]
      const madreId = c.parent_id ?? (conHijas.has(c.id) ? c.id : null)
      const m = madreId ? categorias.find((x) => x.id === madreId) : undefined
      if (m && conHijas.has(m.id) && siguiente?.parent_id !== m.id) {
        salida.push({
          id: m.id,
          nombre: `${m.name} (en general)`,
          icono: m.icon,
          sangria: true,
        })
      }
    })
    return salida
  }, [categorias])

  const frecuentes = useMemo(() => {
    if (categorias.length < MINIMO_FRECUENTES) return []
    const veces = new Map(uso.map((u) => [u.id, u.n]))
    return categorias
      .filter((c) => (veces.get(c.id) ?? 0) > 0)
      .sort((a, b) => (veces.get(b.id) ?? 0) - (veces.get(a.id) ?? 0))
      .slice(0, MAX_FRECUENTES)
      .map((c) => ({ id: c.id, nombre: c.name, icono: c.icon }))
  }, [categorias, uso])

  return (
    <SelectorEntidad
      opciones={opciones}
      frecuentes={frecuentes}
      valor={valor}
      onCambio={onCambio}
      titulo="Categoría"
      placeholder={placeholder}
      vacio={vacio}
    />
  )
}
