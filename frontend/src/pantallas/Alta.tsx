import { X } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"

import { Calculadora } from "@/componentes/Calculadora"
import { Button } from "@/componentes/ui/button"
import { Campo } from "@/componentes/ui/campo"
import { Input } from "@/componentes/ui/input"
import { Select } from "@/componentes/ui/select"
import {
  ApiError,
  type Categoria,
  type Cuenta,
  type MedioPago,
  type TipoMovimiento,
  api,
} from "@/lib/api"
import { uuidv4 } from "@/lib/uuid"
import { cn } from "@/lib/utils"

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

  const [cuentas, setCuentas] = useState<Cuenta[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [medios, setMedios] = useState<MedioPago[]>([])
  const [comercios, setComercios] = useState<string[]>([])
  const [cargando, setCargando] = useState(true)

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

  useEffect(() => {
    Promise.all([
      api.listAccounts(),
      api.listCategories(),
      api.listPaymentMethods(),
      api.listTransactions(200),
    ])
      .then(([cs, cats, ms, txs]) => {
        setCuentas(cs.filter((c) => !c.archived))
        setCategorias(cats.filter((c) => !c.archived))
        setMedios(ms.filter((m) => !m.archived))
        setComercios([...new Set(txs.map((t) => t.payee).filter((p): p is string => !!p))])
      })
      .catch((e) => setError(e instanceof Error ? e.message : "No se pudo cargar"))
      .finally(() => setCargando(false))
  }, [])

  const cuentaSel = cuentas.find((c) => c.id === cuentaId)
  const moneda = cuentaSel?.currency ?? "ARS"

  const nombrePorId = useMemo(
    () => new Map(categorias.map((c) => [c.id, c.name])),
    [categorias],
  )
  const categoriasDelTipo = useMemo(
    () => categorias.filter((c) => c.kind === (tipo === "income" ? "income" : "expense")),
    [categorias, tipo],
  )

  function etiquetaCat(c: Categoria): string {
    return c.parent_id ? `${nombrePorId.get(c.parent_id) ?? "—"} › ${c.name}` : c.name
  }

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
      await api.createTransaction({
        id: uuidv4(),
        kind: tipo,
        occurred_at: new Date(cuando).toISOString(),
        amount: centavos,
        currency: moneda,
        account_id: cuentaId,
        transfer_account_id: tipo === "transfer" ? cuentaDestinoId : null,
        category_id: tipo === "transfer" ? null : categoriaId,
        payment_method_id: medioId || null,
        payee: comercio || null,
        notes: notas || null,
      })
      navigate("/movimientos")
    } catch (e) {
      setError(e instanceof ApiError ? e.detalle : "No se pudo guardar")
      setGuardando(false)
    }
  }

  if (cargando) {
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

      <Calculadora moneda={moneda} onCambio={setCentavos} />

      {cuentas.length === 0 ? (
        <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
          No tenés cuentas todavía. La gestión de cuentas llega en el Inc 14; por ahora se crean
          por la API.
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

      {error && cuentas.length === 0 && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
