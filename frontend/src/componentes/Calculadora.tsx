import { Delete } from "lucide-react"
import { useEffect, useState } from "react"

import { Button } from "@/componentes/ui/button"
import {
  borrarUltimo,
  coma,
  desdeCentavos,
  digito,
  igual,
  limpiar,
  operador,
  valorCentavos,
} from "@/lib/calculadora"
import { formatearEntrada } from "@/lib/dinero"

// Teclado de calculadora para el monto. El display muestra la entrada en curso;
// el valor en centavos se comunica al padre en cada cambio. `inicial` (centavos)
// siembra el monto de arranque, p. ej. al aplicar una plantilla.
export function Calculadora({
  moneda,
  onCambio,
  inicial,
}: {
  moneda: string
  onCambio: (centavos: number) => void
  inicial?: number
}) {
  const [estado, setEstado] = useState(() => desdeCentavos(inicial ?? 0))

  useEffect(() => {
    onCambio(valorCentavos(estado))
  }, [estado, onCambio])

  // Teclado fisico. Se ignora si el foco esta en otro campo (notas, comercio…)
  // para no pisar lo que el usuario escribe ahi.
  useEffect(() => {
    function alTecla(ev: KeyboardEvent) {
      const foco = document.activeElement?.tagName
      if (foco === "INPUT" || foco === "TEXTAREA" || foco === "SELECT") return

      const k = ev.key
      let accion: ((e: typeof estado) => typeof estado) | null = null
      if (/^[0-9]$/.test(k)) accion = (e) => digito(e, k)
      else if (k === "," || k === ".") accion = coma
      else if (k === "+") accion = (e) => operador(e, "+")
      else if (k === "-") accion = (e) => operador(e, "-")
      else if (k === "*" || k === "x" || k === "X") accion = (e) => operador(e, "×")
      else if (k === "/") accion = (e) => operador(e, "÷")
      else if (k === "Enter" || k === "=") accion = igual
      else if (k === "Backspace") accion = borrarUltimo
      else if (k === "Escape" || k === "Delete") accion = limpiar

      if (accion) {
        ev.preventDefault()
        setEstado(accion)
      }
    }
    window.addEventListener("keydown", alTecla)
    return () => window.removeEventListener("keydown", alTecla)
  }, [])

  const simbolo = moneda === "ARS" ? "$" : moneda

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-end gap-2 rounded-lg bg-muted px-4 py-3">
        <span className="text-lg text-muted-foreground">{simbolo}</span>
        <span className="tabular text-3xl font-semibold">{formatearEntrada(estado.entrada)}</span>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {[7, 8, 9].map((n) => (
          <Tecla key={n} onClick={() => setEstado((e) => digito(e, String(n)))}>
            {n}
          </Tecla>
        ))}
        <Tecla variante="op" onClick={() => setEstado((e) => operador(e, "÷"))}>
          ÷
        </Tecla>

        {[4, 5, 6].map((n) => (
          <Tecla key={n} onClick={() => setEstado((e) => digito(e, String(n)))}>
            {n}
          </Tecla>
        ))}
        <Tecla variante="op" onClick={() => setEstado((e) => operador(e, "×"))}>
          ×
        </Tecla>

        {[1, 2, 3].map((n) => (
          <Tecla key={n} onClick={() => setEstado((e) => digito(e, String(n)))}>
            {n}
          </Tecla>
        ))}
        <Tecla variante="op" onClick={() => setEstado((e) => operador(e, "-"))}>
          −
        </Tecla>

        <Tecla onClick={() => setEstado(coma)}>,</Tecla>
        <Tecla onClick={() => setEstado((e) => digito(e, "0"))}>0</Tecla>
        <Tecla onClick={() => setEstado(borrarUltimo)} aria-label="Borrar">
          <Delete className="mx-auto h-5 w-5" />
        </Tecla>
        <Tecla variante="op" onClick={() => setEstado((e) => operador(e, "+"))}>
          +
        </Tecla>

        <Tecla onClick={() => setEstado(limpiar)}>C</Tecla>
        <div className="col-span-3">
          <Tecla variante="igual" onClick={() => setEstado(igual)}>
            =
          </Tecla>
        </div>
      </div>
    </div>
  )
}

function Tecla({
  children,
  onClick,
  variante = "num",
  ...props
}: {
  children: React.ReactNode
  onClick: () => void
  variante?: "num" | "op" | "igual"
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const variant = variante === "igual" ? "default" : variante === "op" ? "secondary" : "outline"
  return (
    <Button type="button" variant={variant} className="h-12 w-full text-lg" onClick={onClick} {...props}>
      {children}
    </Button>
  )
}
