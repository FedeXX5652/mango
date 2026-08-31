import { usePowerSync, useQuery } from "@powersync/react"
import { X } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"

import { Calculadora } from "@/componentes/Calculadora"
import { Button } from "@/componentes/ui/button"
import { Campo } from "@/componentes/ui/campo"
import { Input } from "@/componentes/ui/input"
import { Select } from "@/componentes/ui/select"
import type { TipoMovimiento } from "@/lib/api"
import { ordenarJerarquico } from "@/lib/categorias"
import { uuidv4 } from "@/lib/uuid"
import { cn } from "@/lib/utils"

interface CuentaLocal {
  id: string
  name: string
  currency: string
}
interface CategoriaLocal {
  id: string
  name: string
  kind: string
  parent_id: string | null
}
interface MedioLocal {
  id: string
  name: string
}
interface PlantillaLocal {
  id: string
  name: string
  kind: string
  account_id: string | null
  category_id: string | null
  payment_method_id: string | null
  amount: number | null
  payee: string | null
  notes: string | null
}

const TIPOS: { valor: TipoMovimiento; etiqueta: string }[] = [
  { valor: "expense", etiqueta: "Gasto" },
  { valor: "income", etiqueta: "Ingreso" },
  { valor: "transfer", etiqueta: "Transferencia" },
]

function ahoraLocal(): string {
  const d = new Date()
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 16)
}

export function Alta() {
  const navigate = useNavigate()
  const location = useLocation()
  const db = usePowerSync()

  // Todo se lee de la base local (funciona sin conexion).
  const { data: cuentas, isLoading } = useQuery<CuentaLocal>(
    "SELECT id, name, currency FROM accounts WHERE deleted_at IS NULL AND archived = 0 ORDER BY sort_order, created_at",
  )
  const { data: categorias } = useQuery<CategoriaLocal>(
    "SELECT id, name, kind, parent_id FROM categories WHERE deleted_at IS NULL AND archived = 0",
  )
  const { data: medios } = useQuery<MedioLocal>(
    "SELECT id, name FROM payment_methods WHERE deleted_at IS NULL AND archived = 0",
  )
  const { data: comerciosRows } = useQuery<{ payee: string }>(
    "SELECT DISTINCT payee FROM transactions WHERE payee IS NOT NULL AND deleted_at IS NULL ORDER BY payee",
  )
  const comercios = comerciosRows.map((r) => r.payee)
  const { data: plantillas } = useQuery<PlantillaLocal>(
    "SELECT id, name, kind, account_id, category_id, payment_method_id, amount, payee, notes FROM templates WHERE deleted_at IS NULL ORDER BY sort_order, name",
  )

  const [tipo, setTipo] = useState<TipoMovimiento>("expense")
  const [centavos, setCentavos] = useState(0)
  const [cuentaId, setCuentaId] = useState("")
  const [cuentaDestinoId, setCuentaDestinoId] = useState("")
  const [categoriaId, setCategoriaId] = useState("")
  const [medioId, setMedioId] = useState("")
  const [comercio, setComercio] = useState("")
  const [notas, setNotas] = useState("")
  const [cuando, setCuando] = useState(ahoraLocal)
  const [error, setError] = useState("")
  const [guardando, setGuardando] = useState(false)
  // Monto sembrado al aplicar una plantilla. `calcKey` remonta la calculadora
  // (que maneja su estado interno) para que tome el nuevo valor inicial.
  const [montoInicial, setMontoInicial] = useState(0)
  const [calcKey, setCalcKey] = useState(0)

  const cuentaSel = cuentas.find((c) => c.id === cuentaId)
  const moneda = cuentaSel?.currency ?? "ARS"

  const nombrePorId = useMemo(
    () => new Map(categorias.map((c) => [c.id, c.name])),
    [categorias],
  )
  const categoriasDelTipo = useMemo(
    () =>
      ordenarJerarquico(categorias).filter(
        (c) => c.kind === (tipo === "income" ? "income" : "expense"),
      ),
    [categorias, tipo],
  )

  function etiquetaCat(c: CategoriaLocal): string {
    return c.parent_id ? `${nombrePorId.get(c.parent_id) ?? "—"} › ${c.name}` : c.name
  }

  const aplicarPlantilla = useCallback((t: PlantillaLocal) => {
    setTipo(t.kind as TipoMovimiento)
    if (t.account_id) setCuentaId(t.account_id)
    setCategoriaId(t.category_id ?? "")
    setMedioId(t.payment_method_id ?? "")
    setComercio(t.payee ?? "")
    setNotas(t.notes ?? "")
    if (t.amount && t.amount > 0) {
      setMontoInicial(t.amount)
      setCalcKey((k) => k + 1)
    }
  }, [])

  // Llegada desde la pantalla de Plantillas ("Usar"): aplica una sola vez,
  // cuando las plantillas ya cargaron de la base local.
  const aplicada = useRef(false)
  useEffect(() => {
    if (aplicada.current) return
    const id = (location.state as { plantillaId?: string } | null)?.plantillaId
    if (!id) return
    const t = plantillas.find((p) => p.id === id)
    if (t) {
      aplicada.current = true
      aplicarPlantilla(t)
    }
  }, [location.state, plantillas, aplicarPlantilla])

  async function guardar() {
    setError("")
    if (centavos <= 0) return setError("Ingresá un monto")
    if (!cuentaId) return setError("Elegí una cuenta")
    if (tipo !== "transfer" && !categoriaId) return setError("Elegí una categoría")
    if (tipo === "transfer" && !cuentaDestinoId) return setError("Elegí la cuenta de destino")
    if (tipo === "transfer" && cuentaDestinoId === cuentaId)
      return setError("Las cuentas deben ser distintas")

    setGuardando(true)
    try {
      // Escritura LOCAL: PowerSync la encola y la sube por la API en segundo plano.
      await db.execute(
        `INSERT INTO transactions
           (id, kind, occurred_at, amount, currency, account_id, transfer_account_id,
            category_id, payment_method_id, payee, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          uuidv4(),
          tipo,
          new Date(cuando).toISOString(),
          centavos,
          moneda,
          cuentaId,
          tipo === "transfer" ? cuentaDestinoId : null,
          tipo === "transfer" ? null : categoriaId,
          medioId || null,
          comercio || null,
          notas || null,
        ],
      )
      navigate("/movimientos")
    } catch {
      setError("No se pudo guardar")
      setGuardando(false)
    }
  }

  if (isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Cargando…</div>
  }

  return (
    <div className="mx-auto max-w-md space-y-5 p-4 pb-24">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Nuevo movimiento</h1>
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Cerrar">
          <X className="h-5 w-5" />
        </Button>
      </header>

      <div className="grid grid-cols-3 gap-2">
        {TIPOS.map((t) => (
          <button
            key={t.valor}
            onClick={() => setTipo(t.valor)}
            className={cn(
              "rounded-md border px-2 py-2 text-sm font-medium transition-colors",
              tipo === t.valor
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:bg-muted",
            )}
          >
            {t.etiqueta}
          </button>
        ))}
      </div>

      {plantillas.length > 0 && (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {plantillas.map((t) => (
            <button
              key={t.id}
              onClick={() => aplicarPlantilla(t)}
              className="shrink-0 rounded-full border border-border bg-card px-3 py-1 text-sm hover:bg-muted"
            >
              {t.name}
            </button>
          ))}
        </div>
      )}

      <Calculadora key={calcKey} moneda={moneda} onCambio={setCentavos} inicial={montoInicial} />

      {cuentas.length === 0 ? (
        <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
          No tenés cuentas todavía (o están sincronizando). La gestión de cuentas llega en el Inc
          14; por ahora se crean por la API.
        </p>
      ) : (
        <div className="space-y-4">
          <Campo etiqueta={tipo === "transfer" ? "Desde" : "Cuenta"}>
            <Select value={cuentaId} onChange={(e) => setCuentaId(e.target.value)}>
              <option value="">Elegí una cuenta</option>
              {cuentas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.currency})
                </option>
              ))}
            </Select>
          </Campo>

          {tipo === "transfer" && (
            <Campo etiqueta="Hacia">
              <Select value={cuentaDestinoId} onChange={(e) => setCuentaDestinoId(e.target.value)}>
                <option value="">Elegí la cuenta de destino</option>
                {cuentas
                  .filter((c) => c.id !== cuentaId)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.currency})
                    </option>
                  ))}
              </Select>
            </Campo>
          )}

          {tipo !== "transfer" && (
            <Campo etiqueta="Categoría">
              <Select value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
                <option value="">Elegí una categoría</option>
                {categoriasDelTipo.map((c) => (
                  <option key={c.id} value={c.id}>
                    {etiquetaCat(c)}
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
            <Input
              list="comercios"
              value={comercio}
              onChange={(e) => setComercio(e.target.value)}
              placeholder="Dónde se hizo el gasto"
            />
            <datalist id="comercios">
              {comercios.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Campo>

          <Campo etiqueta="Fecha y hora">
            <Input
              type="datetime-local"
              value={cuando}
              onChange={(e) => setCuando(e.target.value)}
            />
          </Campo>

          <Campo etiqueta="Notas (opcional)">
            <Input value={notas} onChange={(e) => setNotas(e.target.value)} />
          </Campo>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button className="w-full" disabled={guardando} onClick={guardar}>
            {guardando ? "Guardando…" : "Guardar"}
          </Button>
        </div>
      )}
    </div>
  )
}
