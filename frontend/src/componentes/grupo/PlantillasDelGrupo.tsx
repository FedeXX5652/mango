import { usePowerSync, useQuery } from "@powersync/react"
import { Pencil, Plus, Trash2 } from "lucide-react"
import { useState } from "react"

import { FormPlantilla, type PlantillaEditable } from "@/componentes/FormPlantilla"
import { Button } from "@/componentes/ui/button"
import { Confirmar } from "@/componentes/ui/confirmar"
import { Hoja } from "@/componentes/ui/hoja"
import { FilaInset, ListaInset } from "@/componentes/ui/listaInset"
import { formatearMonto } from "@/lib/dinero"

// Plantillas DEL GRUPO (1.6.0, ver 0030, T1): gastos que se repiten (expensas,
// servicios). Sirven para cargar el gasto del grupo de un toque y para "Cargar el
// pago" de un recordatorio del grupo. Las ve y edita cualquier miembro.

type PlantillaDelGrupo = PlantillaEditable & { categoria: string | null }

export function PlantillasDelGrupo({ groupId, moneda }: { groupId: string; moneda: string }) {
  const db = usePowerSync()
  const { data: plantillas } = useQuery<PlantillaDelGrupo>(
    `SELECT t.id, t.name, t.kind, t.account_id, t.category_id, t.payment_method_id, t.amount,
            t.currency, t.payee, t.notes, c.name AS categoria
     FROM templates t LEFT JOIN categories c ON c.id = t.category_id
     WHERE t.group_id = ? AND t.deleted_at IS NULL ORDER BY t.sort_order, t.name`,
    [groupId],
  )
  const [editando, setEditando] = useState<PlantillaDelGrupo | "nueva" | null>(null)
  const [aBorrar, setABorrar] = useState<PlantillaDelGrupo | null>(null)

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground">Plantillas del grupo</h2>
        <Button variant="outline" size="sm" onClick={() => setEditando("nueva")}>
          <Plus className="h-4 w-4" aria-hidden />
          Nueva
        </Button>
      </div>
      {plantillas.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Los gastos que se repiten (expensas, servicios) se cargan de un toque y se usan para pagar
          los recordatorios del grupo.
        </p>
      ) : (
        <ListaInset>
          {plantillas.map((t) => (
            <FilaInset key={t.id}>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{t.name}</span>
                <span className="block text-xs text-muted-foreground">
                  {[
                    t.categoria,
                    t.amount != null
                      ? formatearMonto(t.amount, { moneda: t.currency ?? moneda })
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "Gasto"}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1">
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
                  aria-label={`Borrar ${t.name}`}
                  onClick={() => setABorrar(t)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </span>
            </FilaInset>
          ))}
        </ListaInset>
      )}

      <Hoja
        abierta={editando !== null}
        onOpenChange={(v) => !v && setEditando(null)}
        titulo={editando === "nueva" ? "Nueva plantilla del grupo" : "Editar plantilla"}
      >
        {editando !== null && (
          <FormPlantilla
            key={editando === "nueva" ? "nueva" : editando.id}
            inicial={editando === "nueva" ? undefined : editando}
            grupo={{ id: groupId, moneda }}
            onCerrar={() => setEditando(null)}
          />
        )}
      </Hoja>
      <Confirmar
        destructivo
        abierta={aBorrar !== null}
        onOpenChange={(v) => !v && setABorrar(null)}
        titulo="Borrar plantilla"
        detalle={
          aBorrar
            ? `Se elimina "${aBorrar.name}" para todo el grupo. Los recordatorios que la usaban quedan sin plantilla.`
            : undefined
        }
        etiqueta="Borrar"
        onConfirmar={async () => {
          if (aBorrar) await db.execute("DELETE FROM templates WHERE id = ?", [aBorrar.id])
          setABorrar(null)
        }}
      />
    </section>
  )
}
