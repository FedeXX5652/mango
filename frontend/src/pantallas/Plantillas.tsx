import { usePowerSync, useQuery } from "@powersync/react"
import { Files, Pencil, Trash2 } from "lucide-react"
import { useState } from "react"
import { useNavigate } from "react-router-dom"

import { BotonNuevo, EncabezadoPantalla } from "@/componentes/EncabezadoPantalla"
import { Vacio } from "@/componentes/Vacio"
import { FormPlantilla, type PlantillaEditable } from "@/componentes/FormPlantilla"
import { Button } from "@/componentes/ui/button"
import { Confirmar } from "@/componentes/ui/confirmar"
import { Hoja } from "@/componentes/ui/hoja"
import type { GrupoInfo } from "@/hooks/useEspacio"
import { useVolver } from "@/hooks/useVolver"
import { formatearMonto } from "@/lib/dinero"
import { PERSONAL, rutaEspacio } from "@/lib/espacios"
import { TIPOS_PLANTILLA } from "@/lib/plantillas"
import { DelEspacio } from "@/pantallas/grupo/comun"

// Plantillas: `/plantillas` y, la misma pantalla, `/grupos/<grupo>/plantillas`
// (1.15.0; antes las del grupo eran una seccion de sus Ajustes). Las de un grupo
// son de gasto, con categoria del grupo y sin cuenta (1.6.0, T1): las ve y
// edita cualquier miembro, y sirven para "Cargar el pago" de sus recordatorios.

type Plantilla = PlantillaEditable & { categoria: string | null }

function etiquetaTipo(k: string): string {
  return TIPOS_PLANTILLA.find((t) => t.valor === k)?.etiqueta ?? k
}

export function Plantillas() {
  return <DelEspacio>{(grupo) => <PantallaPlantillas grupo={grupo} />}</DelEspacio>
}

function PantallaPlantillas({ grupo }: { grupo: GrupoInfo | null }) {
  const navigate = useNavigate()
  const espacio = grupo ? { tipo: "grupo" as const, id: grupo.id } : PERSONAL
  // A donde se vino (Inicio, Accesos, Ajustes o un atajo), no a un lugar fijo.
  const volver = useVolver(rutaEspacio(espacio, "accesos"))
  const db = usePowerSync()
  const { data: plantillas, isLoading } = useQuery<Plantilla>(
    `SELECT t.id, t.name, t.kind, t.account_id, t.category_id, t.amount, t.currency, t.payee,
            t.notes, c.name AS categoria
     FROM templates t LEFT JOIN categories c ON c.id = t.category_id
     WHERE t.deleted_at IS NULL AND COALESCE(t.group_id, '') = ? ORDER BY t.sort_order, t.name`,
    [grupo?.id ?? ""],
  )
  const [editando, setEditando] = useState<Plantilla | "nueva" | null>(null)
  const [aBorrar, setABorrar] = useState<Plantilla | null>(null)

  async function borrar(t: Plantilla) {
    await db.execute("DELETE FROM templates WHERE id = ?", [t.id])
  }

  return (
    <div className="mx-auto max-w-xl space-y-4 p-4">
      <EncabezadoPantalla
        titulo="Plantillas"
        volver={volver}
        acciones={<BotonNuevo etiqueta="Nueva plantilla" onClick={() => setEditando("nueva")} />}
      />

      <p className="text-sm text-muted-foreground">
        {grupo
          ? "Los gastos que se repiten en el grupo (expensas, servicios): tocá uno para cargarlo de un toque. También sirven para pagar sus recordatorios."
          : "Gastos o ingresos frecuentes precargados. Tocá una para cargarla de un toque."}
      </p>
      <Hoja
        abierta={editando !== null}
        onOpenChange={(v) => !v && setEditando(null)}
        titulo={editando === "nueva" ? "Nueva plantilla" : "Editar plantilla"}
      >
        {editando !== null && (
          <FormPlantilla
            key={editando === "nueva" ? "nueva" : editando.id}
            inicial={editando === "nueva" ? undefined : editando}
            grupo={grupo ? { id: grupo.id, moneda: grupo.base_currency } : undefined}
            onCerrar={() => setEditando(null)}
          />
        )}
      </Hoja>

      {/* Sin respuesta todavia no hay "vacio" que mostrar (DESIGN.md 7). */}
      {isLoading ? null : plantillas.length === 0 ? (
        <Vacio
          icono={Files}
          titulo={grupo ? "El grupo todavía no tiene plantillas" : "Todavía no tenés plantillas"}
          detalle={
            grupo
              ? "Guardá lo que se paga seguido —las expensas, la luz— y cargalo de un toque."
              : "Guardá lo que cargás seguido —el café, la nafta— y usalo de un toque."
          }
          accion={{ onClick: () => setEditando("nueva"), etiqueta: "Nueva plantilla" }}
        />
      ) : (
        <ul className="divide-y divide-border">
          {plantillas.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-3 py-3">
              <button
                className="min-h-11 min-w-0 flex-1 text-left"
                onClick={() =>
                  navigate(rutaEspacio(espacio, "nuevo"), { state: { plantillaId: t.id } })
                }
              >
                <p className="truncate font-medium">{t.name}</p>
                <p className="text-xs text-muted-foreground">
                  {[
                    etiquetaTipo(t.kind),
                    t.categoria,
                    t.amount != null
                      ? formatearMonto(t.amount, {
                          moneda: t.currency ?? grupo?.base_currency ?? "ARS",
                        })
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
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
        detalle={
          aBorrar
            ? grupo
              ? `Se elimina "${aBorrar.name}" para todo el grupo. Los recordatorios que la usaban quedan sin plantilla.`
              : `Se elimina "${aBorrar.name}".`
            : undefined
        }
        etiqueta="Borrar"
        onConfirmar={() => aBorrar && borrar(aBorrar)}
      />
    </div>
  )
}
