import { usePowerSync, useQuery } from "@powersync/react"
import { useMemo, useState } from "react"

import { SelectorCategoria } from "@/componentes/SelectorCategoria"
import { SelectorEntidad } from "@/componentes/SelectorEntidad"
import { Button } from "@/componentes/ui/button"
import { Campo } from "@/componentes/ui/campo"
import { Input } from "@/componentes/ui/input"
import { Select } from "@/componentes/ui/select"
import { ordenarJerarquico } from "@/lib/categorias"
import { aCentavos, aTextoEditable } from "@/lib/dinero"
import { TIPOS_PLANTILLA } from "@/lib/plantillas"
import { uuidv4 } from "@/lib/uuid"

// Alta y edicion de una plantilla, personal o de un grupo (1.6.0, T1).
//
// Una del grupo es de gasto, con una categoria del grupo y sin cuenta ni medio
// de pago: cada uno paga con lo suyo. Su monto va en la moneda del grupo. El
// tipo y el grupo se eligen al crearla: el servidor no los deja cambiar.

export interface PlantillaEditable {
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

interface Opcion {
  id: string
  name: string
  currency?: string
  kind?: string
  parent_id?: string | null
  icon?: string | null
}

export function FormPlantilla({
  inicial,
  grupo,
  onCerrar,
}: {
  inicial?: PlantillaEditable
  // De un grupo: su id y su moneda.
  grupo?: { id: string; moneda: string }
  onCerrar: () => void
}) {
  const db = usePowerSync()
  // Personal: lo propio (sin la conjunta de un grupo). Del grupo: sus categorias.
  const { data: cuentas } = useQuery<Opcion>(
    "SELECT id, name, currency FROM accounts WHERE deleted_at IS NULL AND archived = 0 AND group_id IS NULL ORDER BY sort_order, created_at",
  )
  const { data: categorias } = useQuery<Opcion>(
    grupo
      ? "SELECT id, name, kind, parent_id, icon FROM categories WHERE deleted_at IS NULL AND archived = 0 AND group_id = ?"
      : "SELECT id, name, kind, parent_id, icon FROM categories WHERE deleted_at IS NULL AND archived = 0 AND group_id IS NULL",
    grupo ? [grupo.id] : [],
  )
  const { data: medios } = useQuery<Opcion>(
    "SELECT id, name FROM payment_methods WHERE deleted_at IS NULL AND archived = 0",
  )

  const [name, setName] = useState(inicial?.name ?? "")
  const [kind, setKind] = useState(grupo ? "expense" : (inicial?.kind ?? "expense"))
  const [monto, setMonto] = useState(
    inicial?.amount
      ? aTextoEditable(inicial.amount, inicial.currency ?? grupo?.moneda ?? "ARS")
      : "",
  )
  const [cuentaId, setCuentaId] = useState(inicial?.account_id ?? "")
  const [categoriaId, setCategoriaId] = useState(inicial?.category_id ?? "")
  const [medioId, setMedioId] = useState(inicial?.payment_method_id ?? "")
  const [payee, setPayee] = useState(inicial?.payee ?? "")
  const [notas, setNotas] = useState(inicial?.notes ?? "")
  const [error, setError] = useState("")

  const cats = useMemo(
    () =>
      ordenarJerarquico(categorias).filter(
        (c) => c.kind === (kind === "income" ? "income" : "expense"),
      ),
    [categorias, kind],
  )

  async function guardar() {
    setError("")
    if (!name.trim()) return setError("Poné un nombre")
    const centavos = aCentavos(monto)
    const importe = centavos && centavos > 0 ? centavos : null
    const moneda =
      importe == null
        ? null
        : grupo
          ? grupo.moneda
          : (cuentas.find((c) => c.id === cuentaId)?.currency ?? inicial?.currency ?? "ARS")
    const valores = [
      name.trim(),
      grupo ? null : cuentaId || null,
      kind === "transfer" ? null : categoriaId || null,
      grupo ? null : medioId || null,
      importe,
      moneda,
      payee.trim() || null,
      notas.trim() || null,
    ]
    try {
      if (inicial) {
        await db.execute(
          `UPDATE templates SET name = ?, account_id = ?, category_id = ?, payment_method_id = ?,
             amount = ?, currency = ?, payee = ?, notes = ? WHERE id = ?`,
          [...valores, inicial.id],
        )
      } else {
        await db.execute(
          `INSERT INTO templates
             (name, account_id, category_id, payment_method_id, amount, currency, payee, notes,
              id, kind, group_id, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
          [...valores, uuidv4(), kind, grupo?.id ?? null],
        )
      }
      onCerrar()
    } catch {
      setError("No se pudo guardar")
    }
  }

  return (
    <div className="space-y-3">
      <Campo etiqueta="Nombre">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={grupo ? "Expensas, Luz…" : "Alquiler, Súper…"}
        />
      </Campo>
      <div className="grid grid-cols-2 gap-3">
        {grupo || inicial ? (
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Tipo</p>
            <p className="flex min-h-11 items-center text-sm">
              {TIPOS_PLANTILLA.find((t) => t.valor === kind)?.etiqueta ?? kind}
            </p>
          </div>
        ) : (
          <Campo etiqueta="Tipo">
            <Select
              value={kind}
              onChange={(e) => {
                setKind(e.target.value)
                setCategoriaId("")
              }}
            >
              {TIPOS_PLANTILLA.map((t) => (
                <option key={t.valor} value={t.valor}>
                  {t.etiqueta}
                </option>
              ))}
            </Select>
          </Campo>
        )}
        <Campo etiqueta={grupo ? `Monto (${grupo.moneda}, opcional)` : "Monto (opcional)"}>
          <Input
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            inputMode="decimal"
            placeholder="0"
          />
        </Campo>
      </div>
      {grupo ? (
        <p className="text-xs text-muted-foreground">
          Sin cuenta: cada uno paga con la suya al cargar el gasto.
        </p>
      ) : (
        <Campo etiqueta="Cuenta (opcional)">
          <SelectorEntidad
            titulo="Cuenta"
            placeholder="Sin cuenta"
            vacio="Sin cuenta"
            opciones={cuentas.map((c) => ({
              id: c.id,
              nombre: c.name,
              detalle: c.currency ?? null,
            }))}
            valor={cuentaId}
            onCambio={setCuentaId}
          />
        </Campo>
      )}
      {kind !== "transfer" && (
        <Campo etiqueta="Categoría (opcional)">
          <SelectorCategoria
            categorias={cats.map((c) => ({
              id: c.id,
              name: c.name,
              parent_id: c.parent_id ?? null,
              icon: c.icon ?? null,
            }))}
            valor={categoriaId}
            onCambio={setCategoriaId}
            placeholder="Sin categoría"
            vacio="Sin categoría"
          />
        </Campo>
      )}
      {!grupo && (
        <Campo etiqueta="Medio de pago (opcional)">
          <SelectorEntidad
            titulo="Medio de pago"
            placeholder="Sin medio"
            vacio="Sin medio"
            opciones={medios.map((m) => ({ id: m.id, nombre: m.name }))}
            valor={medioId}
            onCambio={setMedioId}
          />
        </Campo>
      )}
      <Campo etiqueta="Comercio / contraparte (opcional)">
        <Input value={payee} onChange={(e) => setPayee(e.target.value)} />
      </Campo>
      <Campo etiqueta="Notas (opcional)">
        <Input value={notas} onChange={(e) => setNotas(e.target.value)} />
      </Campo>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button className="flex-1" onClick={guardar}>
          Guardar
        </Button>
        <Button variant="outline" onClick={onCerrar}>
          Cancelar
        </Button>
      </div>
    </div>
  )
}
