import { useQuery } from "@powersync/react"
import { FileText, Paperclip, Trash2 } from "lucide-react"
import { useRef, useState } from "react"

import { Button } from "@/componentes/ui/button"
import { Campo } from "@/componentes/ui/campo"
import { Confirmar } from "@/componentes/ui/confirmar"
import { FilaInset, ListaInset } from "@/componentes/ui/listaInset"
import { useConexion } from "@/hooks/conexion"
import { anunciar } from "@/lib/anuncios"
import { ApiError, api } from "@/lib/api"

// Adjuntos de un movimiento (fase 5): fotos de tickets o PDFs. La metadata baja
// por la sync; el binario se sube y se ve por la API (necesita conexion). El
// cliente no escribe la tabla `attachments`: sube por /transactions/<id>/attachments.
//
// Lo que necesita conexion se apaga sin ella y dice por que, antes del toque
// (DESIGN.md 7, "Estado sin conexion"; 1.12.0).

interface Adjunto {
  id: string
  filename: string
  mime_type: string
  size_bytes: number
}

// El error del servidor en palabras: un movimiento cargado sin conexion todavia
// no existe del otro lado, y el "El movimiento no existe" del servidor confundia.
function motivo(err: unknown, que: string): string {
  if (err instanceof ApiError) {
    if (err.status === 404 || /no existe/i.test(err.detalle))
      return "Este movimiento todavía no se subió: vas a poder adjuntar cuando se sincronice."
    if (err.status === 413) return "El archivo es demasiado grande."
    if (err.status >= 500) return "El servidor no responde. Probá de nuevo en unos minutos."
    if (err.detalle && !/^Error \d+$/.test(err.detalle)) return err.detalle
  }
  return `No se pudo ${que}. Revisá la conexión y probá de nuevo.`
}

export function Adjuntos({ transactionId }: { transactionId: string }) {
  const { data: adjuntos } = useQuery<Adjunto>(
    "SELECT id, filename, mime_type, size_bytes FROM attachments WHERE transaction_id = ? AND deleted_at IS NULL ORDER BY created_at",
    [transactionId],
  )
  const hayConexion = useConexion()
  const inputRef = useRef<HTMLInputElement>(null)
  const [subiendo, setSubiendo] = useState(false)
  const [error, setError] = useState("")
  const [aBorrar, setABorrar] = useState<Adjunto | null>(null)

  async function alElegir(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (inputRef.current) inputRef.current.value = "" // permite re-elegir el mismo
    if (!file) return
    setError("")
    setSubiendo(true)
    try {
      await api.subirAdjunto(transactionId, file)
      // La fila aparece cuando baja por la sync: se dice, para que no parezca
      // que no paso nada.
      anunciar(`«${file.name}» subido: aparece en la lista en unos segundos.`)
    } catch (err) {
      setError(motivo(err, "subir"))
    } finally {
      setSubiendo(false)
    }
  }

  async function ver(a: Adjunto) {
    try {
      const url = await api.urlAdjunto(a.id)
      window.open(url, "_blank", "noopener")
      // Se revoca despues de un rato: el navegador ya lo abrio.
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (err) {
      setError(motivo(err, "abrir"))
    }
  }

  // Borrar un adjunto no tiene vuelta (es del servidor): pide confirmacion.
  async function borrar(a: Adjunto) {
    setError("")
    try {
      await api.borrarAdjunto(a.id)
      anunciar(`«${a.filename}» eliminado.`)
    } catch (err) {
      throw new Error(motivo(err, "borrar"), { cause: err })
    }
  }

  return (
    <Campo etiqueta="Adjuntos">
      <div className="space-y-2">
        {adjuntos.length > 0 && (
          <ListaInset>
            {adjuntos.map((a) => (
              <FilaInset key={a.id}>
                <button
                  type="button"
                  onClick={() => ver(a)}
                  disabled={!hayConexion}
                  className="flex min-w-0 items-center gap-2 text-left hover:underline disabled:no-underline disabled:opacity-60"
                >
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{a.filename}</span>
                </button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-expense"
                  aria-label={`Borrar ${a.filename}`}
                  disabled={!hayConexion}
                  onClick={() => setABorrar(a)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </FilaInset>
            ))}
          </ListaInset>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="image/*,application/pdf"
          className="hidden"
          onChange={alElegir}
        />
        <Button
          variant="secondary"
          size="sm"
          className="gap-2"
          disabled={subiendo || !hayConexion}
          onClick={() => inputRef.current?.click()}
        >
          <Paperclip className="h-4 w-4" />
          {subiendo ? "Subiendo…" : "Adjuntar foto o PDF"}
        </Button>
        {!hayConexion && (
          <p className="text-xs text-muted-foreground">
            Sin conexión no se puede adjuntar, ver ni borrar: los archivos están en el servidor.
          </p>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      <Confirmar
        abierta={aBorrar !== null}
        onOpenChange={(v) => !v && setABorrar(null)}
        titulo="Eliminar adjunto"
        detalle={aBorrar ? `Se elimina «${aBorrar.filename}». No se puede recuperar.` : undefined}
        etiqueta="Eliminar"
        destructivo
        onConfirmar={() => (aBorrar ? borrar(aBorrar) : undefined)}
      />
    </Campo>
  )
}
