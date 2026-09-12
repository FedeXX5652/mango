import { useQuery, useStatus } from "@powersync/react"
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  List,
  type LucideIcon,
  Receipt,
} from "lucide-react"
import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"

import { Calendario } from "@/componentes/Calendario"
import { Vacio } from "@/componentes/Vacio"
import { FilaInset, ListaInset } from "@/componentes/ui/listaInset"
import { Monto } from "@/componentes/Monto"
import { Cargando, Esqueleto, useDemora } from "@/componentes/ui/cargando"
import { Button } from "@/componentes/ui/button"
import { Input } from "@/componentes/ui/input"
import { Select } from "@/componentes/ui/select"
import { useMonedaBase } from "@/hooks/monedaBase"
import { ordenarJerarquico } from "@/lib/categorias"
import { type Direccion } from "@/lib/dinero"
import { mesAnio } from "@/lib/fecha"
import { monedaPorDefecto, ordenarMonedas } from "@/lib/monedas"
import { cn } from "@/lib/utils"

interface Fila {
  id: string
  kind: "expense" | "income" | "transfer"
  amount: number
  currency: string
  occurred_at: string
  payee: string | null
  status: string
  categoria: string | null
  cuenta: string | null
}
interface Opcion {
  id: string
  name: string
  kind?: string
  parent_id?: string | null
}

const DIRECCION: Record<Fila["kind"], Direccion> = {
  expense: "gasto",
  income: "ingreso",
  transfer: "neutro",
}
const COLOR: Record<Fila["kind"], string> = {
  expense: "text-expense",
  income: "text-income",
  transfer: "text-transfer",
}
const ICONO_MOV: Record<Fila["kind"], LucideIcon> = {
  expense: ArrowDownLeft,
  income: ArrowUpRight,
  transfer: ArrowLeftRight,
}

// La lista se agrupa por dia (DESIGN.md 7): clave local, encabezado legible y
// hora corta a la derecha de cada fila.
function claveDia(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

function etiquetaDia(iso: string): string {
  const d = new Date(iso)
  const hoy = new Date()
  const ayer = new Date(hoy)
  ayer.setDate(hoy.getDate() - 1)
  const mismoDia = (a: Date, b: Date) => a.toDateString() === b.toDateString()
  if (mismoDia(d, hoy)) return "Hoy"
  if (mismoDia(d, ayer)) return "Ayer"
  const opciones: Intl.DateTimeFormatOptions = { day: "numeric", month: "long" }
  if (d.getFullYear() !== hoy.getFullYear()) opciones.year = "numeric"
  return d.toLocaleDateString("es-AR", opciones)
}

// 24 horas, que es como se lee la hora en Argentina; el formato de 12 con
// "a. m." tambien queda largo al lado del monto.
function horaCorta(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
}

function EstadoSync() {
  const status = useStatus()
  const texto = !status.connected
    ? "Sin conexión"
    : status.dataFlowStatus.downloading || status.dataFlowStatus.uploading
      ? "Sincronizando…"
      : "Al día"
  return (
    <span className={cn("text-xs", status.connected ? "text-income" : "text-muted-foreground")}>
      {texto}
    </span>
  )
}

export function Movimientos() {
  const navigate = useNavigate()
  const hoy = new Date()
  const [anio, setAnio] = useState(hoy.getFullYear())
  const [mes, setMes] = useState(hoy.getMonth())
  const [vista, setVista] = useState<"lista" | "calendario">("lista")
  const [tipo, setTipo] = useState("")
  const [cuentaId, setCuentaId] = useState("")
  const [categoriaId, setCategoriaId] = useState("")
  const [texto, setTexto] = useState("")
  const [etiquetaId, setEtiquetaId] = useState("")
  const [monedaFiltro, setMonedaFiltro] = useState("")
  // "Faltan datos de conversion": movimientos en otra moneda que la cuenta y
  // sin el monto debitado. Es un FILTRO, no un estado: el movimiento esta
  // completo, lo que falta es un dato del banco (regla 4, ver 0005).
  const [soloSinConversion, setSoloSinConversion] = useState(false)
  const [diaSel, setDiaSel] = useState<number | null>(null)

  const { data: cuentas, isLoading: cargaCuentas } = useQuery<Opcion>(
    "SELECT id, name FROM accounts WHERE deleted_at IS NULL ORDER BY name",
  )
  const { data: categorias } = useQuery<Opcion>(
    "SELECT id, name, kind, parent_id FROM categories WHERE deleted_at IS NULL ORDER BY name",
  )
  const nombreCat = useMemo(() => new Map(categorias.map((c) => [c.id, c.name])), [categorias])
  const { data: etiquetas } = useQuery<Opcion>(
    "SELECT id, name FROM tags WHERE deleted_at IS NULL AND archived = 0",
  )
  const base = useMonedaBase()
  // Cuantos movimientos del mes esperan el monto debitado del banco.
  const { data: sinConversion } = useQuery<{ n: number }>(
    `SELECT COUNT(*) AS n FROM transactions t JOIN accounts a ON a.id = t.account_id
     WHERE t.deleted_at IS NULL AND t.amount_account IS NULL AND a.currency <> t.currency`,
  )
  const { data: monedaRows } = useQuery<{ currency: string }>(
    "SELECT DISTINCT currency FROM transactions WHERE deleted_at IS NULL",
  )
  const monedas = useMemo(
    () => ordenarMonedas(monedaRows.map((r) => r.currency), base),
    [monedaRows, base],
  )
  const etiquetasOrden = useMemo(
    () => [...etiquetas].sort((a, b) => a.name.localeCompare(b.name, "es")),
    [etiquetas],
  )

  // Consulta del mes con los filtros (menos el dia, que se aplica en JS para
  // compartir los datos entre la lista y el calendario).
  const { sql, params } = useMemo(() => {
    const inicio = new Date(anio, mes, 1).toISOString()
    const fin = new Date(anio, mes + 1, 1).toISOString()
    const cond = ["t.deleted_at IS NULL", "t.occurred_at >= ?", "t.occurred_at < ?"]
    const p: (string | number)[] = [inicio, fin]
    if (tipo) {
      cond.push("t.kind = ?")
      p.push(tipo)
    }
    if (cuentaId) {
      cond.push("(t.account_id = ? OR t.transfer_account_id = ?)")
      p.push(cuentaId, cuentaId)
    }
    if (categoriaId) {
      cond.push("t.category_id = ?")
      p.push(categoriaId)
    }
    if (monedaFiltro) {
      cond.push("t.currency = ?")
      p.push(monedaFiltro)
    }
    if (soloSinConversion) {
      cond.push(
        `t.amount_account IS NULL AND a.currency IS NOT NULL AND a.currency <> t.currency`,
      )
    }
    if (etiquetaId) {
      // EXISTS y no JOIN: un movimiento con varias etiquetas no debe duplicarse.
      cond.push(
        `EXISTS (SELECT 1 FROM transaction_tags tt
                 WHERE tt.transaction_id = t.id AND tt.tag_id = ? AND tt.deleted_at IS NULL)`,
      )
      p.push(etiquetaId)
    }
    if (texto.trim()) {
      cond.push("(t.payee LIKE ? OR t.notes LIKE ?)")
      p.push(`%${texto.trim()}%`, `%${texto.trim()}%`)
    }
    return {
      sql: `SELECT t.id, t.kind, t.amount, t.currency, t.occurred_at, t.payee, t.status,
                   c.name AS categoria, a.name AS cuenta
            FROM transactions t
            LEFT JOIN categories c ON c.id = t.category_id
            LEFT JOIN accounts a ON a.id = t.account_id
            WHERE ${cond.join(" AND ")}
            ORDER BY t.occurred_at DESC`,
      params: p,
    }
  }, [anio, mes, tipo, cuentaId, categoriaId, etiquetaId, monedaFiltro, soloSinConversion, texto])

  const { data: mesMovs, isLoading: cargaMovs } = useQuery<Fila>(sql, params)

  const lista = useMemo(
    () =>
      diaSel ? mesMovs.filter((f) => new Date(f.occurred_at).getDate() === diaSel) : mesMovs,
    [mesMovs, diaSel],
  )

  // Grupos por dia, en el orden que ya trae la consulta (occurred_at DESC).
  const grupos = useMemo(() => {
    const m = new Map<string, Fila[]>()
    for (const f of lista) {
      const k = claveDia(f.occurred_at)
      const g = m.get(k)
      if (g) g.push(f)
      else m.set(k, [f])
    }
    return [...m.entries()]
  }, [lista])

  function cambiarMes(delta: number) {
    const d = new Date(anio, mes + delta, 1)
    setAnio(d.getFullYear())
    setMes(d.getMonth())
    setDiaSel(null)
  }

  const etiquetaMes = mesAnio(anio, mes)

  // Sin esto la lista dice "Sin movimientos" antes de tener la respuesta.
  const cargando = cargaMovs || cargaCuentas
  // El umbral solo decide si el esqueleto se VE; el corte es `cargando`.
  const mostrarEsqueleto = useDemora(cargando)

  if (cargando) {
    return (
      <div className="mx-auto max-w-2xl space-y-3 p-4">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Movimientos</h1>
          <EstadoSync />
        </header>
        <Cargando visible={mostrarEsqueleto} className="space-y-3" etiqueta="Cargando movimientos">
          <div className="grid grid-cols-2 gap-2">
            <Esqueleto className="h-10" />
            <Esqueleto className="h-10" />
          </div>
          <Esqueleto className="h-4 w-28" />
          <Esqueleto className="h-64 w-full rounded-xl" />
        </Cargando>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl space-y-3 p-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Movimientos</h1>
        <EstadoSync />
      </header>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => cambiarMes(-1)}
            aria-label="Mes anterior"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <span className="min-w-40 text-center text-sm font-medium">{etiquetaMes}</span>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => cambiarMes(1)}
            aria-label="Mes siguiente"
          >
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>
        <div className="flex gap-1">
          <Button
            variant={vista === "lista" ? "default" : "outline"}
            size="icon"
            onClick={() => setVista("lista")}
            aria-label="Lista"
          >
            <List className="h-4 w-4" />
          </Button>
          <Button
            variant={vista === "calendario" ? "default" : "outline"}
            size="icon"
            onClick={() => setVista("calendario")}
            aria-label="Calendario"
          >
            <CalendarDays className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Select value={tipo} onChange={(e) => setTipo(e.target.value)}>
          <option value="">Todos</option>
          <option value="expense">Gastos</option>
          <option value="income">Ingresos</option>
          <option value="transfer">Transferencias</option>
        </Select>
        <Select value={cuentaId} onChange={(e) => setCuentaId(e.target.value)}>
          <option value="">Toda cuenta</option>
          {cuentas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Select value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
          <option value="">Toda categoría</option>
          {ordenarJerarquico(categorias).map((c) => (
            <option key={c.id} value={c.id}>
              {c.parent_id ? `${nombreCat.get(c.parent_id) ?? "—"} › ${c.name}` : c.name}
            </option>
          ))}
        </Select>
        {monedas.length > 1 && (
          <Select value={monedaFiltro} onChange={(e) => setMonedaFiltro(e.target.value)}>
            <option value="">Toda moneda</option>
            {monedas.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </Select>
        )}
        {etiquetasOrden.length > 0 && (
          <Select value={etiquetaId} onChange={(e) => setEtiquetaId(e.target.value)}>
            <option value="">Toda etiqueta</option>
            {etiquetasOrden.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </Select>
        )}
        <Input
          placeholder="Buscar comercio…"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
        />
      </div>

      {/* Solo aparece si hay algo que completar: un filtro que nunca encuentra
          nada es ruido. */}
      {(sinConversion[0]?.n ?? 0) > 0 && (
        <button
          type="button"
          onClick={() => setSoloSinConversion((v) => !v)}
          className={cn(
            "flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
            soloSinConversion
              ? "border-primary bg-primary/10"
              : "border-border bg-card hover:bg-muted",
          )}
        >
          <span>
            {sinConversion[0].n} movimiento{sinConversion[0].n === 1 ? "" : "s"} sin el monto
            debitado
          </span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {soloSinConversion ? "ver todos" : "ver solo esos"}
          </span>
        </button>
      )}

      {vista === "calendario" ? (
        <Calendario
          anio={anio}
          mes={mes}
          moneda={monedaFiltro || monedaPorDefecto(monedas, base)}
          movimientos={mesMovs}
          onDia={(d) => {
            setDiaSel(d)
            setVista("lista")
          }}
        />
      ) : (
        <>
          {diaSel && (
            <button className="text-xs text-primary underline" onClick={() => setDiaSel(null)}>
              Día {diaSel} — quitar filtro
            </button>
          )}
          {lista.length === 0 ? (
            <Vacio
              icono={Receipt}
              titulo="Sin movimientos"
              detalle="No hay movimientos con estos filtros."
              accion={{ to: "/nuevo", etiqueta: "Nuevo movimiento" }}
            />
          ) : (
            <div className="space-y-4">
              {grupos.map(([clave, filas]) => (
                <section key={clave}>
                  <h3 className="mb-2 px-1 text-xs font-medium text-muted-foreground">
                    {etiquetaDia(filas[0].occurred_at)}
                  </h3>
                  <ListaInset>
                    {filas.map((f) => {
                      const Icono = ICONO_MOV[f.kind]
                      const titulo =
                        f.payee || f.categoria || (f.kind === "transfer" ? "Transferencia" : "—")
                      const sub = [f.payee ? f.categoria : null, f.cuenta].filter(Boolean)
                      if (f.status === "pending") sub.push("pendiente")
                      return (
                        <FilaInset key={f.id} onClick={() => navigate(`/movimientos/${f.id}`)}>
                          <div className="flex min-w-0 items-center gap-3">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted">
                              <Icono className={cn("h-4 w-4", COLOR[f.kind])} />
                            </span>
                            <div className="min-w-0">
                              <p className="truncate font-medium">{titulo}</p>
                              {sub.length > 0 && (
                                <p className="truncate text-xs text-muted-foreground">
                                  {sub.join(" · ")}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="shrink-0 text-right">
                            <Monto
                              centavos={f.amount}
                              moneda={f.currency}
                              direccion={DIRECCION[f.kind]}
                              variante="lista"
                              className={cn("font-medium", COLOR[f.kind])}
                            />
                            <p className="font-mono text-xs text-muted-foreground">
                              {horaCorta(f.occurred_at)}
                            </p>
                          </div>
                        </FilaInset>
                      )
                    })}
                  </ListaInset>
                </section>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
