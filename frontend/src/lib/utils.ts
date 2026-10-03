import { type ClassValue, clsx } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

// tailwind-merge tiene que conocer los tamaños de letra propios
// (tailwind.config.ts, DESIGN.md 3): si no, toma `text-barra` por un COLOR y lo
// descarta al combinarlo con `text-muted-foreground`, y el texto queda con el
// tamaño heredado.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        {
          text: [
            "secundaria",
            "cuerpo",
            "monto-lista",
            "seccion",
            "titulo",
            "destacado",
            "barra",
            "celda",
          ],
        },
      ],
    },
  },
})

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
