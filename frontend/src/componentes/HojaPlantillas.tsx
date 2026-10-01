import { usePowerSync } from "@powersync/react"
import { Check, Plus } from "lucide-react"
import { useState } from "react"

import { Button } from "@/componentes/ui/button"
import { Campo } from "@/componentes/ui/campo"
import { Hoja } from "@/componentes/ui/hoja"
import { Input } from "@/componentes/ui/input"
import { FilaInset, ListaInset } from "@/componentes/ui/listaInset"
import { uuidv4 } from "@/lib/uuid"

export interface PlantillaLocal {
  id: string
  name: string
  kind: string
  account_id: string | null
  category_id: string | null
  payment_method_id: string | null
  amount: number | null
  currency: string | null
  payee: string | null
  notes: string | null
}

// Lo que hay cargado en el formulario, para guardarlo como plantilla.
export interface CargaActual {
  kind: string
  account_id: string | null
  category_id: string | null
  payment_method_id: string | null
  amount: number | null
  currency: string
  payee: string | null
  notes: string | null
}

// Con mas de estas, la lista lleva buscador (como SelectorEntidad, 0007).
const CON_BUSCADOR = 6

// Plantillas en el alta: una hoja con las guardadas y un "+" para guardar lo
// cargado como plantilla nueva. Reemplaza a la fila de chips con scroll
// horizontal, que con muchas plantillas no servia (se veian dos y el resto
// quedaba escondido).
export function HojaPlantillas({
  abierta,
  onOpenChange,
  plantillas,
  detalle,
  onAplicar,
  actual,
  sugerencia,
}: {
  abierta: boolean
  onOpenChange: (v: boolean) => void
  plantillas: PlantillaLocal[]
  // Linea secundaria de cada fila (tipo · categoria · monto), la arma el alta.
  detalle: (t: PlantillaLocal) => string
  onAplicar: (t: PlantillaLocal) => void
  actual: CargaActual
  // Nombre propuesto para la plantilla nueva (el comercio o la categoria).
  sugerencia: string
}) {
  const db = usePowerSync()
  const [busqueda, setBusqueda] = useState("")
  const [creando, setCreando] = useState(false)
  const [nombre, setNombre] = useState("")
  const [error, setError] = useState("")
  const [guardada, setGuardada] = useState<string | null>(null)

  const q = busqueda.trim().toLowerCase()
  const visibles = q ? plantillas.filter((t) => t.name.toLowerCase().includes(q)) : plantillas

  function cambiarAbierta(v: boolean) {
    onOpenChange(v)
    if (!v) {
      setBusqueda("")
      setCreando(false)
      setError("")
      setGuardada(null)
    }
  }

  function empezarACrear() {
    setNombre(sugerencia)
    setError("")
    setGuardada(null)
    setCreando(true)
  }

  async function guardarNueva() {
    const limpio = nombre.trim()
    if (!limpio) return setError("Ponele un nombre")
    try {
      await db.execute(
        `INSERT INTO templates
           (id, name, kind, account_id, category_id, payment_method_id, amount, currency, payee, notes, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        [
          uuidv4(),
          limpio,
          actual.kind,
          actual.account_id,
          // Una transferencia no lleva categoria (igual que en Plantillas).
          actual.kind === "transfer" ? null : actual.category_id,
          actual.payment_method_id,
          actual.amount,
          actual.currency,
          actual.payee,
          actual.notes,
        ],
      )
      setGuardada(limpio)
      setCreando(false)
    } catch {
      setError("No se pudo guardar la plantilla")
    }
  }

  return (
    <Hoja abierta={abierta} onOpenChange={cambiarAbierta} titulo="Plantillas">
      <div className="space-y-4">
        {plantillas.length > CON_BUSCADOR && (
          <Input
            type="search"
            aria-label="Buscar plantilla"
            placeholder="Buscar plantilla…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        )}

        {plantillas.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Todavía no hay plantillas. Cargá un movimiento que repitas seguido y guardalo acá: la
            próxima vez se completa de un toque.
          </p>
        ) : visibles.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            Ninguna plantilla coincide con “{busqueda.trim()}”.
          </p>
        ) : (
          <ListaInset>
            {visibles.map((t) => (
              <FilaInset
                key={t.id}
                onClick={() => {
                  onAplicar(t)
                  cambiarAbierta(false)
                }}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{t.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{detalle(t)}</span>
                </span>
              </FilaInset>
            ))}
          </ListaInset>
        )}

        {guardada && (
          <p role="status" className="flex items-center gap-2 text-sm text-income">
            <Check className="h-4 w-4 shrink-0" aria-hidden />
            Plantilla “{guardada}” guardada.
          </p>
        )}

        {creando ? (
          <div className="space-y-3 rounded-xl border border-border p-4">
            <Campo etiqueta="Nombre de la plantilla">
              <Input
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Ej: Súper del sábado"
                onKeyDown={(e) => {
                  if (e.key === "Enter") guardarNueva()
                }}
              />
            </Campo>
            <p className="text-xs text-muted-foreground">
              Guarda el tipo, la cuenta, la categoría, el medio, el monto, el comercio y las notas
              que tenés cargados ahora.
            </p>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setCreando(false)}>
                Cancelar
              </Button>
              <Button className="flex-1" onClick={guardarNueva}>
                Guardar plantilla
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="outline" className="w-full" onClick={empezarACrear}>
            <Plus className="h-4 w-4" aria-hidden />
            Guardar lo cargado como plantilla
          </Button>
        )}
      </div>
    </Hoja>
  )
}
