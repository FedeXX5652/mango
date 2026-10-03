import { Delete } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { Button } from "@/componentes/ui/button"
import {
  type Op,
  aEntrada,
  borrarUltimo,
  coma,
  cuentaEnCurso,
  desdeCentavos,
  digito,
  igual,
  limpiar,
  operador,
  resultado,
  valorCentavos,
} from "@/lib/calculadora"
import { decimalesDe, formatearEntrada, partesMonto } from "@/lib/dinero"
import { cn } from "@/lib/utils"

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
  const [estado, setEstado] = useState(() => desdeCentavos(inicial ?? 0, moneda))
  // Los decimales de la moneda (0 en JPY o CLP): limitan lo que se tipea y el
  // valor se convierte en ESA moneda.
  const dec = decimalesDe(moneda)
  const decRef = useRef(dec)
  useEffect(() => {
    decRef.current = dec
  }, [dec])

  useEffect(() => {
    onCambio(valorCentavos(estado, moneda))
  }, [estado, onCambio, moneda])

  // Teclado fisico. Se ignora si el foco esta en otro campo (notas, comercio…)
  // para no pisar lo que el usuario escribe ahi.
  const raiz = useRef<HTMLDivElement>(null)
  useEffect(() => {
    function alTecla(ev: KeyboardEvent) {
      const foco = document.activeElement?.tagName
      if (foco === "INPUT" || foco === "TEXTAREA" || foco === "SELECT") return
      // Con una hoja abierta encima (elegir cuenta, categoria…) las teclas son
      // de la hoja: Escape la cierra y no tiene que borrar el monto, ni un
      // numero tipeado ahi sumarse a la cuenta de atras.
      const yo = raiz.current
      const capas = document.querySelectorAll('[role="dialog"], [role="alertdialog"]')
      if ([...capas].some((c) => !yo || !c.contains(yo))) return
      // Enter sobre un control de afuera (Guardar, un selector) es de ese
      // control: tomarlo como "=" le impedia activarse con el teclado.
      const destino = ev.target instanceof Element ? ev.target : null
      if (
        ev.key === "Enter" &&
        destino?.closest("button, a, [role=button], [role=radio], [role=tab]") &&
        !yo?.contains(destino)
      )
        return

      const k = ev.key
      let accion: ((e: typeof estado) => typeof estado) | null = null
      if (/^[0-9]$/.test(k)) accion = (e) => digito(e, k, decRef.current)
      else if (k === "," || k === ".") accion = (e) => coma(e, decRef.current)
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

  // El simbolo sale de Intl segun la moneda y cual es la base (ver dinero.ts).
  const simbolo = partesMonto(0, { moneda }).simbolo

  // Arriba del numero, la cuenta en curso ("100 +") y, con el segundo numero
  // tipeado, el resultado parcial: es lo que se va a guardar (ver resultado()).
  const cuenta = cuentaEnCurso(estado)
  const parcial = cuenta && !estado.reiniciar ? resultado(estado) : null
  const texto = formatearEntrada(estado.entrada)
  // Un monto largo baja de tamaño antes que desbordar (nunca se abrevia, 0006).
  const tamano = texto.length > 14 ? "text-xl" : texto.length > 10 ? "text-2xl" : "text-3xl"
  const pulsar = (op: Op) => setEstado((e) => operador(e, op))

  return (
    <div ref={raiz} className="space-y-3">
      <div className="rounded-lg bg-muted px-4 py-2">
        <div className="tabular flex min-h-5 items-baseline justify-between gap-2 text-sm text-muted-foreground">
          <span>{cuenta ? `${formatearEntrada(cuenta.izquierda)} ${cuenta.op}` : ""}</span>
          <span>{parcial !== null ? `= ${formatearEntrada(aEntrada(parcial))}` : ""}</span>
        </div>
        <div className="flex items-baseline justify-end gap-2">
          <span className="text-lg text-muted-foreground">{simbolo}</span>
          <span aria-live="polite" className={cn("tabular font-semibold", tamano)}>
            {texto}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {[7, 8, 9].map((n) => (
          <Tecla key={n} onClick={() => setEstado((e) => digito(e, String(n), dec))}>
            {n}
          </Tecla>
        ))}
        <Tecla
          variante="op"
          activa={estado.op === "÷"}
          onClick={() => pulsar("÷")}
          aria-label="Dividir"
        >
          ÷
        </Tecla>

        {[4, 5, 6].map((n) => (
          <Tecla key={n} onClick={() => setEstado((e) => digito(e, String(n), dec))}>
            {n}
          </Tecla>
        ))}
        <Tecla
          variante="op"
          activa={estado.op === "×"}
          onClick={() => pulsar("×")}
          aria-label="Multiplicar"
        >
          ×
        </Tecla>

        {[1, 2, 3].map((n) => (
          <Tecla key={n} onClick={() => setEstado((e) => digito(e, String(n), dec))}>
            {n}
          </Tecla>
        ))}
        <Tecla
          variante="op"
          activa={estado.op === "-"}
          onClick={() => pulsar("-")}
          aria-label="Restar"
        >
          −
        </Tecla>

        <Tecla onClick={() => setEstado((e) => coma(e, dec))} disabled={dec === 0}>
          ,
        </Tecla>
        <Tecla onClick={() => setEstado((e) => digito(e, "0", dec))}>0</Tecla>
        <Tecla onClick={() => setEstado(borrarUltimo)} aria-label="Borrar">
          <Delete className="mx-auto h-5 w-5" />
        </Tecla>
        <Tecla
          variante="op"
          activa={estado.op === "+"}
          onClick={() => pulsar("+")}
          aria-label="Sumar"
        >
          +
        </Tecla>

        <Tecla onClick={() => setEstado(limpiar)} aria-label="Borrar todo">
          C
        </Tecla>
        <div className="col-span-3">
          <Tecla variante="igual" onClick={() => setEstado(igual)} aria-label="Igual">
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
  activa = false,
  ...props
}: {
  children: React.ReactNode
  onClick: () => void
  variante?: "num" | "op" | "igual"
  // Operador pendiente: queda marcado hasta el segundo numero o el "=".
  activa?: boolean
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const variant = variante === "igual" ? "default" : variante === "op" ? "secondary" : "outline"
  return (
    <Button
      type="button"
      variant={variant}
      aria-pressed={variante === "op" ? activa : undefined}
      // `touch-manipulation`: sin esto, dos toques rapidos en la misma tecla (00,
      // 55) el telefono los toma como doble toque para hacer zoom y el segundo
      // se pierde. `select-none`: una pulsacion larga no selecciona el texto.
      className={cn(
        "h-12 w-full touch-manipulation select-none font-mono text-lg",
        activa && "bg-accent text-accent-foreground ring-2 ring-inset ring-ring",
      )}
      onClick={onClick}
      {...props}
    >
      {children}
    </Button>
  )
}
