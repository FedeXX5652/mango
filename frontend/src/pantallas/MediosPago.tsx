import { usePowerSync, useQuery } from "@powersync/react"
import { ArrowLeft } from "lucide-react"
import { useState } from "react"
import { useNavigate } from "react-router-dom"

import { Button } from "@/componentes/ui/button"
import { Campo } from "@/componentes/ui/campo"
import { Input } from "@/componentes/ui/input"
import { Select } from "@/componentes/ui/select"
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
    "SELECT id, name, kind, last4, brand, archived FROM payment_methods WHERE deleted_at IS NULL ORDER BY archived, created_at",
  )
  const [mostrarForm, setMostrarForm] = useState(false)

  async function archivar(m: Medio, valor: number) {
    await db.execute("UPDATE payment_methods SET archived = ? WHERE id = ?", [valor, m.id])
  }

  return (
    <div className="mx-auto max-w-xl space-y-4 p-4">
      <header className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate("/ajustes")} aria-label="Volver">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-semibold">Medios de pago</h1>
      </header>

      {mostrarForm ? (
        <FormularioMedio onCerrar={() => setMostrarForm(false)} />
      ) : (
        <Button className="w-full" onClick={() => setMostrarForm(true)}>
          Nuevo medio
        </Button>
      )}

      <ul className="divide-y divide-border">
        {medios.map((m) => (
          <li key={m.id} className="flex items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className={cn("truncate font-medium", m.archived && "text-muted-foreground")}>
                {m.name}
                {m.last4 ? ` ····${m.last4}` : ""}
              </p>
              <p className="text-xs text-muted-foreground">
                {KINDS[m.kind] ?? m.kind}
                {m.brand ? ` · ${m.brand}` : ""}
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => archivar(m, m.archived ? 0 : 1)}>
              {m.archived ? "Desarchivar" : "Archivar"}
            </Button>
          </li>
        ))}
      </ul>
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
    await db.execute(
      "INSERT INTO payment_methods (id, name, kind, last4, brand, archived) VALUES (?, ?, ?, ?, ?, 0)",
      [uuidv4(), name.trim(), kind, last4.trim() || null, brand.trim() || null],
    )
    onCerrar()
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-4">
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
