import { useQuery } from "@powersync/react"
import { FileText, Paperclip, Trash2 } from "lucide-react"
import { useRef, useState } from "react"

import { Button } from "@/componentes/ui/button"
import { Campo } from "@/componentes/ui/campo"
import { FilaInset, ListaInset } from "@/componentes/ui/listaInset"
import { ApiError, api } from "@/lib/api"

// Adjuntos de un movimiento (fase 5): fotos de tickets o PDFs. La metadata baja
// por la sync; el binario se sube y se ve por la API (necesita conexion). El
// cliente no escribe la tabla `attachments`: sube por /transactions/<id>/attachments.

interface Adjunto {
  id: string
  filename: string
  mime_type: string
  size_bytes: number
}

export function Adjuntos({ transactionId }: { transactionId: string }) {
  const { data: adjuntos } = useQuery<Adjunto>(
    "SELECT id, filename, mime_type, size_bytes FROM attachments WHERE transaction_id = ? AND deleted_at IS NULL ORDER BY created_at",
    [transactionId],
  )
  const inputRef = useRef<HTMLInputElement>(null)
  const [subiendo, setSubiendo] = useState(false)
  const [error, setError] = useState("")

  async function alElegir(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (inputRef.current) inputRef.current.value = "" // permite re-elegir el mismo
    if (!file) return
    setError("")
    setSubiendo(true)
    try {
      await api.subirAdjunto(transactionId, file)
      // La fila aparece sola cuando baja por la sync.
    } catch (err) {
      setError(
        err instanceof ApiError ? err.detalle : "No se pudo subir. ¿Hay conexión?",
      )
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
    } catch {
      setError("No se pudo abrir. ¿Hay conexión?")
    }
  }

  async function borrar(a: Adjunto) {
    setError("")
    try {
      await api.borrarAdjunto(a.id)
    } catch {
      setError("No se pudo borrar. ¿Hay conexión?")
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
                  className="flex min-w-0 items-center gap-2 text-left hover:underline"
                >
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{a.filename}</span>
                </button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-expense"
                  aria-label="Borrar adjunto"
                  onClick={() => borrar(a)}
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
          variant="outline"
          size="sm"
          className="gap-2"
          disabled={subiendo}
          onClick={() => inputRef.current?.click()}
        >
          <Paperclip className="h-4 w-4" />
          {subiendo ? "Subiendo…" : "Adjuntar foto o PDF"}
        </Button>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </Campo>
  )
}
