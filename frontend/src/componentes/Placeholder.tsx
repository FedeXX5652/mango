interface Props {
  titulo: string
  nota?: string
}

// Pantalla placeholder para el andamiaje (Inc 11). Las pantallas reales
// llegan en Inc 12+.
export function Placeholder({ titulo, nota }: Props) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
      <h1 className="text-2xl font-semibold">{titulo}</h1>
      <p className="text-sm text-muted-foreground">{nota ?? "En construcción."}</p>
    </div>
  )
}
