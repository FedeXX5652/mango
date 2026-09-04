import { SIN_COLOR } from "@/lib/paleta"

// Fila cruda: gasto sumado por etiqueta (viene de transaction_tags JOIN
// transactions).
export interface GastoEtiquetaRow {
  id: string
  total: number
  n: number
}

// Etiqueta como la conoce el informe. Incluye las archivadas: un movimiento
// viejo puede llevar una etiqueta ya archivada y el gasto igual hay que
// mostrarlo.
export interface EtiquetaInfo {
  id: string
  name: string
  color: string | null
  archived?: number
}

export interface GastoEtiqueta {
  id: string
  name: string
  color: string
  archived: boolean
  total: number
  n: number
}

// Une el gasto con el nombre y el color de cada etiqueta y ordena de mayor a
// menor. Una fila cuya etiqueta no existe (borrada) se descarta: sin nombre no
// hay nada que informar.
//
// Ojo con la suma: un movimiento con dos etiquetas suma en las dos, asi que el
// total de este informe puede superar el gasto del periodo. Por eso no se
// calculan porcentajes sobre el gasto total (mentirian); la barra se mide
// contra la etiqueta mas grande.
export function agruparPorEtiqueta(
  filas: GastoEtiquetaRow[],
  etiquetas: EtiquetaInfo[],
): GastoEtiqueta[] {
  const porId = new Map(etiquetas.map((e) => [e.id, e]))
  const salida: GastoEtiqueta[] = []
  for (const f of filas) {
    const e = porId.get(f.id)
    if (!e) continue
    salida.push({
      id: e.id,
      name: e.name,
      color: e.color ?? SIN_COLOR,
      archived: Boolean(e.archived),
      total: f.total,
      n: f.n,
    })
  }
  return salida.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "es"))
}
