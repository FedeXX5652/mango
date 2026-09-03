import { Button } from "@/componentes/ui/button"
import { Hoja } from "@/componentes/ui/hoja"

// Confirmacion de una accion destructiva. Se apoya en Hoja: en movil es un
// action sheet desde abajo, en escritorio un alert dialog centrado.
interface Props {
  abierta: boolean
  onOpenChange: (v: boolean) => void
  titulo: string
  detalle?: string
  etiqueta?: string
  onConfirmar: () => void
}

export function ConfirmarDestructivo({
  abierta,
  onOpenChange,
  titulo,
  detalle,
  etiqueta = "Eliminar",
  onConfirmar,
}: Props) {
  return (
    <Hoja abierta={abierta} onOpenChange={onOpenChange} titulo={titulo}>
      {detalle && <p className="mb-4 text-sm text-muted-foreground">{detalle}</p>}
      <div className="flex flex-col gap-2">
        <Button
          variant="destructive"
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
