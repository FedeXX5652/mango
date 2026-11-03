import { Calculator } from "lucide-react"
import { type ComponentProps, forwardRef, useRef, useState } from "react"

import { Calculadora } from "@/componentes/Calculadora"
import { Button } from "@/componentes/ui/button"
import { Hoja } from "@/componentes/ui/hoja"
import { Input } from "@/componentes/ui/input"
import { aCentavos, aTextoEditable } from "@/lib/dinero"
import { cn } from "@/lib/utils"

// Un monto que no es el del alta (1.14.0): topes, metas, deudas, saldos,
// plantillas, repartos. Se escribe directo, como antes, y el boton de al lado
// abre la MISMA calculadora del alta en una hoja: una sola forma de calcular un
// monto en toda la app. El valor es el texto del campo, asi que reemplaza a un
// `<Input inputMode="decimal">` sin tocar como lo lee cada pantalla.
type Props = Omit<ComponentProps<typeof Input>, "value" | "onChange"> & {
  value: string
  onChange: (texto: string) => void
  moneda: string
  // Encabezado de la hoja: "Tope de Supermercado".
  titulo?: string
  // La tecla "±" (un saldo puede ser negativo).
  conSigno?: boolean
  // El ancho, para un campo chico dentro de una fila ("w-32").
  contenedor?: string
  // Boton mas angosto, para esos campos chicos.
  compacto?: boolean
  // Para un campo que guarda solo (al salir de el): lo calculado, al tocar Listo.
  onListo?: (texto: string) => void
}

export const CampoMonto = forwardRef<HTMLInputElement, Props>(function CampoMonto(
  {
    value,
    onChange,
    moneda,
    titulo = "Monto",
    conSigno,
    contenedor,
    compacto,
    onListo,
    className,
    ...resto
  },
  ref,
) {
  const [abierta, setAbierta] = useState(false)
  // Lo que va calculando: se pasa al campo solo con "Listo".
  const centavos = useRef(0)

  return (
    <div className={cn("relative", contenedor)}>
      <Input
        {...resto}
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode="decimal"
        className={cn(compacto ? "pr-8" : "pr-12", className)}
      />
      <button
        type="button"
        onClick={() => setAbierta(true)}
        disabled={resto.disabled}
        aria-label={`Calcular ${titulo.toLowerCase()}`}
        className={cn(
          "absolute inset-y-0 right-0 flex items-center justify-center rounded-r-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
          compacto ? "w-8" : "w-11",
        )}
      >
        <Calculator className="h-4 w-4" aria-hidden />
      </button>

      <Hoja abierta={abierta} onOpenChange={setAbierta} titulo={titulo}>
        {abierta && (
          <div className="space-y-3">
            <Calculadora
              moneda={moneda}
              inicial={aCentavos(value, moneda) ?? 0}
              conSigno={conSigno}
              onCambio={(c) => {
                centavos.current = c
              }}
            />
            <Button
              className="w-full"
              onClick={() => {
                const texto = centavos.current === 0 ? "" : aTextoEditable(centavos.current, moneda)
                onChange(texto)
                onListo?.(texto)
                setAbierta(false)
              }}
            >
              Listo
            </Button>
          </div>
        )}
      </Hoja>
    </div>
  )
})
