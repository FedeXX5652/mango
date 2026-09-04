import { usePowerSync, useQuery } from "@powersync/react"
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Trash2,
} from "lucide-react"
import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"

import { Button } from "@/componentes/ui/button"
import { Campo } from "@/componentes/ui/campo"
import { Aviso, Confirmar } from "@/componentes/ui/confirmar"
import { Hoja } from "@/componentes/ui/hoja"
import { Input } from "@/componentes/ui/input"
import { FilaInset, ListaInset } from "@/componentes/ui/listaInset"
import { Select } from "@/componentes/ui/select"
import { moverEnOrden } from "@/lib/orden"
import { uuidv4 } from "@/lib/uuid"
import { cn } from "@/lib/utils"

interface Medio {
  id: string
  name: string
  kind: string
  last4: string | null
  brand: string | null
  archived: number
}

const KINDS: Record<string, string> = {
  debit_card: "Tarjeta de débito",
  credit_card: "Tarjeta de crédito",
  cash: "Efectivo",
  transfer: "Transferencia",
  wallet: "Billetera",
  other: "Otro",
}

export function MediosPago() {
  const navigate = useNavigate()
  const db = usePowerSync()
  const { data: medios } = useQuery<Medio>(
    "SELECT id, name, kind, last4, brand, archived FROM payment_methods WHERE deleted_at IS NULL ORDER BY archived, sort_order, created_at",
  )
  const { data: enUsoRows } = useQuery<{ id: string }>(
    `SELECT payment_method_id AS id FROM transactions WHERE deleted_at IS NULL AND payment_method_id IS NOT NULL
     UNION SELECT payment_method_id FROM payment_method_accounts WHERE deleted_at IS NULL AND payment_method_id IS NOT NULL
     UNION SELECT payment_method_id FROM templates WHERE deleted_at IS NULL AND payment_method_id IS NOT NULL
     UNION SELECT payment_method_id FROM recurring_rules WHERE deleted_at IS NULL AND payment_method_id IS NOT NULL`,
  )
  const enUso = useMemo(() => new Set(enUsoRows.map((r) => r.id)), [enUsoRows])
  const { data: movsRows } = useQuery<{ id: string; n: number }>(
    "SELECT payment_method_id AS id, COUNT(*) AS n FROM transactions WHERE deleted_at IS NULL AND payment_method_id IS NOT NULL GROUP BY payment_method_id",
  )
  const movs = useMemo(() => new Map(movsRows.map((r) => [r.id, r.n])), [movsRows])

  const [mostrarForm, setMostrarForm] = useState(false)
  const [accion, setAccion] = useState<{ tipo: "archivar" | "eliminar"; m: Medio } | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [ordenando, setOrdenando] = useState(false)

  async function archivar(m: Medio, valor: number) {
    await db.execute("UPDATE payment_methods SET archived = ? WHERE id = ?", [valor, m.id])
  }
  async function borrar(m: Medio) {
    await db.execute("DELETE FROM payment_methods WHERE id = ?", [m.id])
  }

  function motivo(m: Medio): string {
    const n = movs.get(m.id) ?? 0
    return n > 0
      ? `No se puede eliminar: tiene ${n} movimiento${n === 1 ? "" : "s"} asociado${n === 1 ? "" : "s"}. Archivalo en su lugar.`
      : "No se puede eliminar: está en uso (cuentas, plantillas o recurrentes). Archivalo en su lugar."
  }
  function alTacho(m: Medio) {
    if (enUso.has(m.id)) setAviso(motivo(m))
    else setAccion({ tipo: "eliminar", m })
  }
  function alArchivar(m: Medio) {
    if (m.archived) archivar(m, 0)
    else setAccion({ tipo: "archivar", m })
  }

  const activos = medios.filter((m) => !m.archived)
  const archivados = medios.filter((m) => m.archived)

  async function mover(m: Medio, delta: -1 | 1) {
    await moverEnOrden(
      db,
      "UPDATE payment_methods SET sort_order = ? WHERE id = ?",
      activos,
      activos.findIndex((x) => x.id === m.id),
      delta,
    )
  }

  function filaMedio(m: Medio, i?: number) {
    const eliminable = !enUso.has(m.id)
    return (
      <FilaInset key={m.id}>
        <div className="min-w-0">
          <p className={cn("truncate font-medium", m.archived && "text-muted-foreground")}>
            {m.name}
            {m.last4 ? ` ····${m.last4}` : ""}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {KINDS[m.kind] ?? m.kind}
            {m.brand ? ` · ${m.brand}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {ordenando && i !== undefined ? (
            <>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Subir"
                disabled={i === 0}
                onClick={() => mover(m, -1)}
              >
                <ChevronUp className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Bajar"
                disabled={i === activos.length - 1}
                onClick={() => mover(m, 1)}
              >
                <ChevronDown className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                size="icon"
                aria-label={m.archived ? "Desarchivar" : "Archivar"}
                onClick={() => alArchivar(m)}
              >
                {m.archived ? (
                  <ArchiveRestore className="h-4 w-4" />
                ) : (
                  <Archive className="h-4 w-4" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Eliminar"
                aria-disabled={!eliminable}
                className={eliminable ? "text-expense" : "text-muted-foreground/40"}
                onClick={() => alTacho(m)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </FilaInset>
    )
  }

  return (
    <div className="mx-auto max-w-xl space-y-4 p-4">
      <header className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate("/ajustes")} aria-label="Volver">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-semibold">Medios de pago</h1>
      </header>

      <div className="flex gap-2">
        <Button className="flex-1" onClick={() => setMostrarForm(true)}>
          Nuevo medio
        </Button>
        <Button
          variant={ordenando ? "default" : "outline"}
          onClick={() => setOrdenando((o) => !o)}
          disabled={activos.length < 2}
        >
          {ordenando ? "Listo" : "Ordenar"}
        </Button>
      </div>
      <Hoja abierta={mostrarForm} onOpenChange={setMostrarForm} titulo="Nuevo medio">
        <FormularioMedio onCerrar={() => setMostrarForm(false)} />
      </Hoja>

      {activos.length > 0 && <ListaInset>{activos.map((m, i) => filaMedio(m, i))}</ListaInset>}

      {archivados.length > 0 && (
        <section className="space-y-2 pt-2">
          <h2 className="px-1 text-sm font-semibold text-muted-foreground">Archivados</h2>
          <ListaInset>{archivados.map(filaMedio)}</ListaInset>
        </section>
      )}

      <Confirmar
        abierta={accion !== null}
        onOpenChange={(v) => {
          if (!v) setAccion(null)
        }}
        titulo={accion?.tipo === "eliminar" ? "Eliminar medio de pago" : "Archivar medio de pago"}
        detalle={
          accion?.tipo === "eliminar"
            ? `Se elimina "${accion.m.name}". No está en uso.`
            : accion
              ? `"${accion.m.name}" se oculta de los selectores. Podés desarchivarlo cuando quieras.`
              : undefined
        }
        etiqueta={accion?.tipo === "eliminar" ? "Eliminar" : "Archivar"}
        destructivo={accion?.tipo === "eliminar"}
        onConfirmar={() => {
          if (!accion) return
          if (accion.tipo === "eliminar") borrar(accion.m)
          else archivar(accion.m, 1)
        }}
      />
      <Aviso
        abierta={aviso !== null}
        onOpenChange={(v) => {
          if (!v) setAviso(null)
        }}
        titulo="No se puede eliminar"
        detalle={aviso ?? ""}
      />
    </div>
  )
}

function FormularioMedio({ onCerrar }: { onCerrar: () => void }) {
  const db = usePowerSync()
  const [name, setName] = useState("")
  const [kind, setKind] = useState("debit_card")
  const [last4, setLast4] = useState("")
  const [brand, setBrand] = useState("")
  const [error, setError] = useState("")

  async function guardar() {
    if (!name.trim()) return setError("Poné un nombre")
    try {
      await db.execute(
        "INSERT INTO payment_methods (id, name, kind, last4, brand, archived) VALUES (?, ?, ?, ?, ?, 0)",
        [uuidv4(), name.trim(), kind, last4.trim() || null, brand.trim() || null],
      )
      onCerrar()
    } catch {
      setError("No se pudo guardar")
    }
  }

  return (
    <div className="space-y-3">
      <Campo etiqueta="Nombre">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Débito 8027" />
      </Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo etiqueta="Tipo">
          <Select value={kind} onChange={(e) => setKind(e.target.value)}>
            {Object.entries(KINDS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </Campo>
        <Campo etiqueta="Últimos 4 (opcional)">
          <Input value={last4} onChange={(e) => setLast4(e.target.value.replace(/\D/g, ""))} maxLength={4} />
        </Campo>
      </div>
      <Campo etiqueta="Marca (opcional)">
        <Input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Visa" />
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
