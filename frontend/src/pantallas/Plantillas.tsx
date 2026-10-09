import { usePowerSync, useQuery } from "@powersync/react"
import { ArrowLeft, Pencil, Trash2 } from "lucide-react"
import { useState } from "react"
import { useNavigate } from "react-router-dom"

import { FormPlantilla, type PlantillaEditable } from "@/componentes/FormPlantilla"
import { Button } from "@/componentes/ui/button"
import { Confirmar } from "@/componentes/ui/confirmar"
import { Hoja } from "@/componentes/ui/hoja"
import { useVolver } from "@/hooks/useVolver"
import { formatearMonto } from "@/lib/dinero"
import { TIPOS_PLANTILLA } from "@/lib/plantillas"

// Plantillas personales. Las de un grupo se administran en Ajustes del grupo
// (1.6.0, T1).

function etiquetaTipo(k: string): string {
  return TIPOS_PLANTILLA.find((t) => t.valor === k)?.etiqueta ?? k
}

export function Plantillas() {
  const navigate = useNavigate()
  // A donde se vino (Inicio, Accesos, Ajustes o un atajo), no a un lugar fijo.
  const volver = useVolver("/accesos")
  const db = usePowerSync()
  const { data: plantillas } = useQuery<PlantillaEditable>(
    `SELECT id, name, kind, account_id, category_id, payment_method_id, amount, currency, payee, notes
     FROM templates WHERE deleted_at IS NULL AND group_id IS NULL ORDER BY sort_order, name`,
  )
  const [editando, setEditando] = useState<PlantillaEditable | "nueva" | null>(null)
  const [aBorrar, setABorrar] = useState<PlantillaEditable | null>(null)

  async function borrar(t: PlantillaEditable) {
    await db.execute("DELETE FROM templates WHERE id = ?", [t.id])
  }

  return (
    <div className="mx-auto max-w-xl space-y-4 p-4">
      <header className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={volver} aria-label="Volver">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-2xl font-semibold">Plantillas</h1>
      </header>

      <p className="text-sm text-muted-foreground">
        Gastos o ingresos frecuentes precargados. Tocá una para cargarla de un toque.
      </p>

      <Button className="w-full" onClick={() => setEditando("nueva")}>
        Nueva plantilla
      </Button>
      <Hoja
        abierta={editando !== null}
        onOpenChange={(v) => !v && setEditando(null)}
        titulo={editando === "nueva" ? "Nueva plantilla" : "Editar plantilla"}
      >
        {editando !== null && (
          <FormPlantilla
            key={editando === "nueva" ? "nueva" : editando.id}
            inicial={editando === "nueva" ? undefined : editando}
            onCerrar={() => setEditando(null)}
          />
        )}
      </Hoja>

      {plantillas.length === 0 ? (
        <p className="p-8 text-center text-sm text-muted-foreground">
          Todavía no tenés plantillas.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {plantillas.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-3 py-3">
              <button
                className="min-h-11 min-w-0 flex-1 text-left"
                onClick={() => navigate("/nuevo", { state: { plantillaId: t.id } })}
              >
                <p className="truncate font-medium">{t.name}</p>
                <p className="text-xs text-muted-foreground">
                  {etiquetaTipo(t.kind)}
                  {t.amount != null &&
                    ` · ${formatearMonto(t.amount, { moneda: t.currency ?? "ARS" })}`}
                </p>
              </button>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Editar ${t.name}`}
                  onClick={() => setEditando(t)}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-expense"
                  onClick={() => setABorrar(t)}
                  aria-label={`Borrar ${t.name}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Confirmar
        destructivo
        abierta={aBorrar !== null}
        onOpenChange={(v) => {
          if (!v) setABorrar(null)
        }}
        titulo="Borrar plantilla"
        detalle={aBorrar ? `Se elimina "${aBorrar.name}".` : undefined}
        etiqueta="Borrar"
        onConfirmar={() => aBorrar && borrar(aBorrar)}
      />
    </div>
  )
}
