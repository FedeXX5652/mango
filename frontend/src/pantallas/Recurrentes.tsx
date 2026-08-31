import { usePowerSync, useQuery } from "@powersync/react"
import { ArrowLeft, Pause, Play, Trash2 } from "lucide-react"
import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"

import { Button } from "@/componentes/ui/button"
import { Campo } from "@/componentes/ui/campo"
import { Input } from "@/componentes/ui/input"
import { Select } from "@/componentes/ui/select"
import { api } from "@/lib/api"
import { ordenarJerarquico } from "@/lib/categorias"
import { aCentavos, formatearCentavos } from "@/lib/dinero"
import { uuidv4 } from "@/lib/uuid"
import { cn } from "@/lib/utils"

interface Regla {
  id: string
  name: string
  kind: string
  amount: number
  frequency: string
  interval_count: number
  next_run_date: string
  active: number
  auto_create: number
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
const FRECUENCIAS: { valor: string; etiqueta: string }[] = [
  { valor: "daily", etiqueta: "Diaria" },
  { valor: "weekly", etiqueta: "Semanal" },
  { valor: "monthly", etiqueta: "Mensual" },
  { valor: "yearly", etiqueta: "Anual" },
]

function etiquetaTipo(k: string): string {
  return TIPOS.find((t) => t.valor === k)?.etiqueta ?? k
}
function etiquetaFrec(f: string, n: number): string {
  const base = FRECUENCIAS.find((x) => x.valor === f)?.etiqueta ?? f
  return n > 1 ? `Cada ${n} (${base.toLowerCase()})` : base
}
function hoyISO(): string {
  const d = new Date()
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}
function fechaCorta(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("es-AR", { day: "2-digit", month: "short" })
}

export function Recurrentes() {
  const navigate = useNavigate()
  const db = usePowerSync()
  const { data: reglas } = useQuery<Regla>(
    "SELECT id, name, kind, amount, frequency, interval_count, next_run_date, active, auto_create FROM recurring_rules WHERE deleted_at IS NULL ORDER BY active DESC, next_run_date",
  )
  const [mostrarForm, setMostrarForm] = useState(false)
  const [corriendo, setCorriendo] = useState(false)
  const [aviso, setAviso] = useState("")

  async function ejecutar() {
    setCorriendo(true)
    setAviso("")
    try {
      const r = await api.runRecurring()
      const partes = []
      if (r.generated > 0) partes.push(`${r.generated} movimiento(s)`)
      if (r.budgets_created > 0) partes.push(`${r.budgets_created} asignación(es) de sobre`)
      setAviso(partes.length ? `Se generaron ${partes.join(" y ")}.` : "No había nada vencido.")
    } catch {
      setAviso("No se pudo ejecutar (¿sin conexión?).")
    } finally {
      setCorriendo(false)
    }
  }

  async function toggleActiva(r: Regla) {
    await db.execute("UPDATE recurring_rules SET active = ? WHERE id = ?", [r.active ? 0 : 1, r.id])
  }
  async function borrar(r: Regla) {
    await db.execute("DELETE FROM recurring_rules WHERE id = ?", [r.id])
  }

  return (
    <div className="mx-auto max-w-xl space-y-4 p-4">
      <header className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate("/ajustes")} aria-label="Volver">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-semibold">Recurrentes</h1>
      </header>

      <p className="text-sm text-muted-foreground">
        Sueldo, alquiler, servicios: se definen una vez y el sistema genera el movimiento en cada
        vencimiento.
      </p>

      <div className="flex gap-2">
        {mostrarForm ? null : (
          <Button className="flex-1" onClick={() => setMostrarForm(true)}>
            Nueva regla
          </Button>
        )}
        <Button variant="outline" onClick={ejecutar} disabled={corriendo}>
          {corriendo ? "Ejecutando…" : "Ejecutar vencidas"}
        </Button>
      </div>
      {aviso && <p className="text-sm text-muted-foreground">{aviso}</p>}

      {mostrarForm && <FormRegla onCerrar={() => setMostrarForm(false)} />}

      {reglas.length === 0 ? (
        <p className="p-8 text-center text-sm text-muted-foreground">
          Todavía no tenés reglas recurrentes.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {reglas.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className={cn("truncate font-medium", !r.active && "text-muted-foreground")}>
                  {r.name}
                  {!r.active && " · pausada"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {etiquetaTipo(r.kind)} · $ {formatearCentavos(r.amount)} ·{" "}
                  {etiquetaFrec(r.frequency, r.interval_count)} · próx. {fechaCorta(r.next_run_date)}
                </p>
              </div>
              <div className="flex shrink-0 items-center">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => toggleActiva(r)}
                  aria-label={r.active ? "Pausar" : "Reanudar"}
                >
                  {r.active ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-expense"
                  onClick={() => borrar(r)}
                  aria-label="Borrar"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function FormRegla({ onCerrar }: { onCerrar: () => void }) {
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
  const [cuentaDestinoId, setCuentaDestinoId] = useState("")
  const [categoriaId, setCategoriaId] = useState("")
  const [medioId, setMedioId] = useState("")
  const [frequency, setFrequency] = useState("monthly")
  const [intervalo, setIntervalo] = useState("1")
  const [desde, setDesde] = useState(hoyISO)
  const [hasta, setHasta] = useState("")
  const [autoCreate, setAutoCreate] = useState(true)
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
    const centavos = aCentavos(monto)
    if (!name.trim()) return setError("Poné un nombre")
    if (!centavos || centavos <= 0) return setError("Ingresá un monto")
    if (!cuentaId) return setError("Elegí una cuenta")
    if (kind === "transfer") {
      if (!cuentaDestinoId) return setError("Elegí la cuenta de destino")
      if (cuentaDestinoId === cuentaId) return setError("Las cuentas deben ser distintas")
    } else if (!categoriaId) {
      return setError("Elegí una categoría")
    }
    const moneda = cuentas.find((c) => c.id === cuentaId)?.currency ?? "ARS"
    const intervaloN = Math.max(1, Number.parseInt(intervalo, 10) || 1)

    await db.execute(
      `INSERT INTO recurring_rules
         (id, name, kind, account_id, transfer_account_id, category_id, payment_method_id,
          amount, currency, frequency, interval_count, start_date, next_run_date, end_date,
          auto_create, active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [
        uuidv4(),
        name.trim(),
        kind,
        cuentaId,
        kind === "transfer" ? cuentaDestinoId : null,
        kind === "transfer" ? null : categoriaId,
        medioId || null,
        centavos,
        moneda,
        frequency,
        intervaloN,
        desde,
        desde, // next_run_date arranca en la primera fecha
        hasta || null,
        autoCreate ? 1 : 0,
      ],
    )
    onCerrar()
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-4">
      <Campo etiqueta="Nombre">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Alquiler, Sueldo…" />
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
        <Campo etiqueta="Monto">
          <Input value={monto} onChange={(e) => setMonto(e.target.value)} inputMode="decimal" placeholder="0" />
        </Campo>
      </div>

      <Campo etiqueta={kind === "transfer" ? "Desde" : "Cuenta"}>
        <Select value={cuentaId} onChange={(e) => setCuentaId(e.target.value)}>
          <option value="">Elegí una cuenta</option>
          {cuentas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Campo>

      {kind === "transfer" ? (
        <Campo etiqueta="Hacia">
          <Select value={cuentaDestinoId} onChange={(e) => setCuentaDestinoId(e.target.value)}>
            <option value="">Elegí la cuenta de destino</option>
            {cuentas
              .filter((c) => c.id !== cuentaId)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </Select>
        </Campo>
      ) : (
        <Campo etiqueta="Categoría">
          <Select value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
            <option value="">Elegí una categoría</option>
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

      <div className="grid grid-cols-2 gap-3">
        <Campo etiqueta="Frecuencia">
          <Select value={frequency} onChange={(e) => setFrequency(e.target.value)}>
            {FRECUENCIAS.map((f) => (
              <option key={f.valor} value={f.valor}>
                {f.etiqueta}
              </option>
            ))}
          </Select>
        </Campo>
        <Campo etiqueta="Cada">
          <Input
            value={intervalo}
            onChange={(e) => setIntervalo(e.target.value.replace(/\D/g, ""))}
            inputMode="numeric"
            placeholder="1"
          />
        </Campo>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Campo etiqueta="Primera fecha">
          <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
        </Campo>
        <Campo etiqueta="Hasta (opcional)">
          <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </Campo>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={autoCreate}
          onChange={(e) => setAutoCreate(e.target.checked)}
        />
        Generar el movimiento automáticamente
      </label>

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
