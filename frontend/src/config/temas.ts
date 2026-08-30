// Temas predefinidos. 'default' (mango) es obligatorio y es el fallback.
// Los otros dos son variaciones de marca (ver src/styles/tema-mango.css).

export interface TemaInfo {
  id: string
  nombre: string
  // Color de marca, para la previa en el selector.
  muestra: string
}

export const TEMAS: TemaInfo[] = [
  { id: "default", nombre: "Mango", muestra: "#FDBE02" },
  { id: "bosque", nombre: "Bosque", muestra: "#0F766E" },
  { id: "indigo", nombre: "Índigo", muestra: "#4F46E5" },
]

export const TEMA_POR_DEFECTO = "default"

export function temaValido(id: string): boolean {
  return TEMAS.some((t) => t.id === id)
}
