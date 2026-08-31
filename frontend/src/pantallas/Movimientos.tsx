import { useQuery, useStatus } from "@powersync/react"
import { CalendarDays, ChevronLeft, ChevronRight, List } from "lucide-react"
import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"

import { Calendario } from "@/componentes/Calendario"
import { Button } from "@/componentes/ui/button"
import { Input } from "@/componentes/ui/input"
import { Select } from "@/componentes/ui/select"
import { ordenarJerarquico } from "@/lib/categorias"
import { type Direccion, formatearMonto } from "@/lib/dinero"
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

function fechaHora(iso: string): string {
  return new Date(iso).toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
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
  const [diaSel, setDiaSel] = useState<number | null>(null)

  const { data: cuentas } = useQuery<Opcion>(
    "SELECT id, name FROM accounts WHERE deleted_at IS NULL ORDER BY name",
  )
  const { data: categorias } = useQuery<Opcion>(
    "SELECT id, name, kind, parent_id FROM categories WHERE deleted_at IS NULL ORDER BY name",
  )
  const nombreCat = useMemo(() => new Map(categorias.map((c) => [c.id, c.name])), [categorias])

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
  }, [anio, mes, tipo, cuentaId, categoriaId, texto])

  const { data: mesMovs } = useQuery<Fila>(sql, params)

  const lista = diaSel
    ? mesMovs.filter((f) => new Date(f.occurred_at).getDate() === diaSel)
    : mesMovs

  function cambiarMes(delta: number) {
    const d = new Date(anio, mes + delta, 1)
    setAnio(d.getFullYear())
    setMes(d.getMonth())
    setDiaSel(null)
  }

  const etiquetaMes = new Date(anio, mes, 1).toLocaleDateString("es-AR", {
    month: "long",
    year: "numeric",
  })

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
          <span className="min-w-40 text-center text-sm font-medium capitalize">{etiquetaMes}</span>
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
        <Input
          placeholder="Buscar comercio…"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
        />
      </div>

      {vista === "calendario" ? (
        <Calendario
          anio={anio}
          mes={mes}
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
            <p className="p-8 text-center text-sm text-muted-foreground">Sin movimientos.</p>
          ) : (
            <ul className="divide-y divide-border">
              {lista.map((f) => (
                <li key={f.id}>
                  <button
                    onClick={() => navigate(`/movimientos/${f.id}`)}
                    className="flex w-full items-center justify-between gap-3 py-3 text-left hover:bg-muted"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {f.payee || f.categoria || (f.kind === "transfer" ? "Transferencia" : "—")}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {f.cuenta} · {fechaHora(f.occurred_at)}
                        {f.status === "pending" && " · pendiente"}
                      </p>
                    </div>
                    <span className={cn("tabular font-medium", COLOR[f.kind])}>
                      {formatearMonto(f.amount, {
                        moneda: f.currency,
                        direccion: DIRECCION[f.kind],
                      })}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
