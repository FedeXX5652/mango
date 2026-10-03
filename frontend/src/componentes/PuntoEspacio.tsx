// La marca de un espacio (0026): Personal lleva el amarillo de marca; un grupo,
// su color (dato, no token). Siempre acompaña al nombre: el color solo no dice
// nada (DESIGN.md 9).
export function PuntoEspacio({ color }: { color: string | null }) {
  return color ? (
    <span
      className="h-3 w-3 shrink-0 rounded-full"
      style={{ backgroundColor: color }}
      aria-hidden
    />
  ) : (
    <span className="h-3 w-3 shrink-0 rounded-full bg-primary" aria-hidden />
  )
}
