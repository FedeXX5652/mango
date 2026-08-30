import { Delete } from "lucide-react"
import { useEffect, useState } from "react"

import { Button } from "@/componentes/ui/button"
import {
  INICIAL,
  borrarUltimo,
  coma,
  digito,
  igual,
  limpiar,
  operador,
  valorCentavos,
} from "@/lib/calculadora"

// Teclado de calculadora para el monto. El display muestra la entrada en curso;
// el valor en centavos se comunica al padre en cada cambio.
export function Calculadora({
  moneda,
  onCambio,
}: {
  moneda: string
  onCambio: (centavos: number) => void
}) {
  const [estado, setEstado] = useState(INICIAL)

  useEffect(() => {
    onCambio(valorCentavos(estado))
  }, [estado, onCambio])

  const simbolo = moneda === "ARS" ? "$" : moneda

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-end gap-2 rounded-lg bg-muted px-4 py-3">
        <span className="text-lg text-muted-foreground">{simbolo}</span>
        <span className="tabular text-3xl font-semibold">{estado.entrada}</span>
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
