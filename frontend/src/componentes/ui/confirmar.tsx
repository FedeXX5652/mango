import { Button } from "@/componentes/ui/button"
import { Hoja } from "@/componentes/ui/hoja"

// Confirmacion de una accion (archivar, eliminar…). Se apoya en Hoja: en movil
// es un action sheet desde abajo, en escritorio un alert dialog centrado.
// `destructivo` pinta el boton principal en rojo (borrado).
export function Confirmar({
  abierta,
  onOpenChange,
  titulo,
  detalle,
  etiqueta = "Confirmar",
  destructivo,
  onConfirmar,
}: {
  abierta: boolean
  onOpenChange: (v: boolean) => void
  titulo: string
  detalle?: string
  etiqueta?: string
  destructivo?: boolean
  onConfirmar: () => void
}) {
  return (
    <Hoja abierta={abierta} onOpenChange={onOpenChange} titulo={titulo}>
      {detalle && <p className="mb-4 text-sm text-muted-foreground">{detalle}</p>}
      <div className="flex flex-col gap-2">
        <Button
          variant={destructivo ? "destructive" : "default"}
          onClick={() => {
            onConfirmar()
            onOpenChange(false)
          }}
        >
          {etiqueta}
        </Button>
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          Cancelar
        </Button>
      </div>
    </Hoja>
  )
}

// Aviso informativo (una sola accion): "no se puede eliminar porque…".
export function Aviso({
  abierta,
  onOpenChange,
  titulo,
  detalle,
}: {
  abierta: boolean
  onOpenChange: (v: boolean) => void
  titulo: string
  detalle: string
}) {
  return (
    <Hoja abierta={abierta} onOpenChange={onOpenChange} titulo={titulo}>
      <p className="mb-4 text-sm text-muted-foreground">{detalle}</p>
      <Button variant="outline" className="w-full" onClick={() => onOpenChange(false)}>
        Entendido
      </Button>
    </Hoja>
  )
}
