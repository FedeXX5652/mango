import { usePowerSync, useQuery } from "@powersync/react"
import { ArrowLeft, Trash2 } from "lucide-react"
import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"

import { Button } from "@/componentes/ui/button"
import { Campo } from "@/componentes/ui/campo"
import { ConfirmarDestructivo } from "@/componentes/ui/confirmar"
import { Hoja } from "@/componentes/ui/hoja"
import { Input } from "@/componentes/ui/input"
import { Select } from "@/componentes/ui/select"
import { ordenarJerarquico } from "@/lib/categorias"
import { aCentavos, formatearCentavos } from "@/lib/dinero"
import { uuidv4 } from "@/lib/uuid"

interface Plantilla {
  id: string
  name: string
  kind: string
  amount: number | null
}
interface Opcion {
  id: string
  name: string
  currency?: string
  kind?: string
  parent_id?: string | null
}

const TIPOS: { valor: string; etiqueta: string }[] = [
  { valor: "expense", etiqueta: "Gasto" },
  { valor: "income", etiqueta: "Ingreso" },
  { valor: "transfer", etiqueta: "Transferencia" },
]

function etiquetaTipo(k: string): string {
  return TIPOS.find((t) => t.valor === k)?.etiqueta ?? k
}

export function Plantillas() {
  const navigate = useNavigate()
  const db = usePowerSync()
  const { data: plantillas } = useQuery<Plantilla>(
    "SELECT id, name, kind, amount FROM templates WHERE deleted_at IS NULL ORDER BY sort_order, name",
  )
  const [mostrarForm, setMostrarForm] = useState(false)
  const [aBorrar, setABorrar] = useState<Plantilla | null>(null)

  async function borrar(t: Plantilla) {
    await db.execute("DELETE FROM templates WHERE id = ?", [t.id])
  }

  return (
    <div className="mx-auto max-w-xl space-y-4 p-4">
      <header className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate("/ajustes")} aria-label="Volver">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-semibold">Plantillas</h1>
      </header>

      <p className="text-sm text-muted-foreground">
        Gastos o ingresos frecuentes precargados. Tocá una para cargarla de un toque.
      </p>

      <Button className="w-full" onClick={() => setMostrarForm(true)}>
        Nueva plantilla
      </Button>
      <Hoja abierta={mostrarForm} onOpenChange={setMostrarForm} titulo="Nueva plantilla">
        <FormPlantilla onCerrar={() => setMostrarForm(false)} />
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
                className="min-w-0 flex-1 text-left"
                onClick={() => navigate("/nuevo", { state: { plantillaId: t.id } })}
              >
                <p className="truncate font-medium">{t.name}</p>
                <p className="text-xs text-muted-foreground">
                  {etiquetaTipo(t.kind)}
                  {t.amount != null && ` · $ ${formatearCentavos(t.amount)}`}
                </p>
              </button>
              <Button
                variant="ghost"
                size="sm"
                className="text-expense"
                onClick={() => setABorrar(t)}
                aria-label="Borrar plantilla"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <ConfirmarDestructivo
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

function FormPlantilla({ onCerrar }: { onCerrar: () => void }) {
  const db = usePowerSync()
  const { data: cuentas } = useQuery<Opcion>(
    "SELECT id, name, currency FROM accounts WHERE deleted_at IS NULL AND archived = 0 ORDER BY sort_order, created_at",
  )
  const { data: categorias } = useQuery<Opcion>(
    "SELECT id, name, kind, parent_id FROM categories WHERE deleted_at IS NULL AND archived = 0",
  )
  const { data: medios } = useQuery<Opcion>(
    "SELECT id, name FROM payment_methods WHERE deleted_at IS NULL AND archived = 0",
  )

  const [name, setName] = useState("")
  const [kind, setKind] = useState("expense")
  const [monto, setMonto] = useState("")
  const [cuentaId, setCuentaId] = useState("")
  const [categoriaId, setCategoriaId] = useState("")
  const [medioId, setMedioId] = useState("")
  const [payee, setPayee] = useState("")
  const [notas, setNotas] = useState("")
  const [error, setError] = useState("")

  const nombreCat = useMemo(() => new Map(categorias.map((c) => [c.id, c.name])), [categorias])
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
    const moneda = importe != null ? (cuentas.find((c) => c.id === cuentaId)?.currency ?? "ARS") : null
    try {
      await db.execute(
        `INSERT INTO templates
           (id, name, kind, account_id, category_id, payment_method_id, amount, currency, payee, notes, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        [
          uuidv4(),
          name.trim(),
          kind,
          cuentaId || null,
          kind === "transfer" ? null : categoriaId || null,
          medioId || null,
          importe,
          moneda,
          payee.trim() || null,
          notas.trim() || null,
        ],
      )
      onCerrar()
    } catch {
      setError("No se pudo guardar")
    }
  }

  return (
    <div className="space-y-3">
      <Campo etiqueta="Nombre">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Alquiler, Súper…" />
      </Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo etiqueta="Tipo">
          <Select
            value={kind}
            onChange={(e) => {
              setKind(e.target.value)
              setCategoriaId("")
            }}
          >
            {TIPOS.map((t) => (
              <option key={t.valor} value={t.valor}>
                {t.etiqueta}
              </option>
            ))}
          </Select>
        </Campo>
        <Campo etiqueta="Monto (opcional)">
          <Input value={monto} onChange={(e) => setMonto(e.target.value)} inputMode="decimal" placeholder="0" />
        </Campo>
      </div>
      <Campo etiqueta="Cuenta (opcional)">
        <Select value={cuentaId} onChange={(e) => setCuentaId(e.target.value)}>
          <option value="">Sin cuenta</option>
          {cuentas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Campo>
      {kind !== "transfer" && (
        <Campo etiqueta="Categoría (opcional)">
          <Select value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
            <option value="">Sin categoría</option>
            {cats.map((c) => (
              <option key={c.id} value={c.id}>
                {c.parent_id ? `${nombreCat.get(c.parent_id) ?? "—"} › ${c.name}` : c.name}
              </option>
            ))}
          </Select>
        </Campo>
      )}
      <Campo etiqueta="Medio de pago (opcional)">
        <Select value={medioId} onChange={(e) => setMedioId(e.target.value)}>
          <option value="">Sin medio</option>
          {medios.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </Select>
      </Campo>
      <Campo etiqueta="Comercio / contraparte (opcional)">
        <Input value={payee} onChange={(e) => setPayee(e.target.value)} />
      </Campo>
      <Campo etiqueta="Notas (opcional)">
        <Input value={notas} onChange={(e) => setNotas(e.target.value)} />
      </Campo>
      {error && <p className="text-sm text-destructive">{error}</p>}
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
