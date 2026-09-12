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
  deshabilitado,
  nota,
  children,
  onConfirmar,
}: {
  abierta: boolean
  onOpenChange: (v: boolean) => void
  titulo: string
  detalle?: string
  etiqueta?: string
  destructivo?: boolean
  // Para las pocas acciones que NO se pueden hacer sin conexion (ver DESIGN 7):
  // el boton queda apagado y `nota` dice por que. Es la excepcion, no la regla:
  // todo lo que se escribe local se puede hacer siempre.
  deshabilitado?: boolean
  nota?: React.ReactNode
  // Detalle mas largo que una frase: una lista de consecuencias, por ejemplo.
  children?: React.ReactNode
  onConfirmar: () => void
}) {
  return (
    <Hoja abierta={abierta} onOpenChange={onOpenChange} titulo={titulo}>
      {detalle && <p className="mb-4 text-sm text-muted-foreground">{detalle}</p>}
      {children}
      {nota && <p className="mb-3 text-sm text-muted-foreground">{nota}</p>}
      <div className="flex flex-col gap-2">
        <Button
          variant={destructivo ? "destructive" : "default"}
          disabled={deshabilitado}
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
