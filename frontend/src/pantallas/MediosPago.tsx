import { usePowerSync, useQuery } from "@powersync/react"
import { ArrowUpDown, BellPlus, BellRing, ChevronDown, ChevronUp } from "lucide-react"
import { useMemo, useState } from "react"

import { AccionesEdicion, AccionesFila } from "@/componentes/AccionesEdicion"
import { BotonNuevo, EncabezadoPantalla } from "@/componentes/EncabezadoPantalla"
import { HojaReasignar } from "@/componentes/HojaReasignar"
import { HojaAvisarme } from "@/componentes/recordatorios/HojaAvisarme"
import { Button } from "@/componentes/ui/button"
import { SelectorEntidad } from "@/componentes/SelectorEntidad"
import { Campo } from "@/componentes/ui/campo"
import { Confirmar } from "@/componentes/ui/confirmar"
import { Hoja } from "@/componentes/ui/hoja"
import { Input } from "@/componentes/ui/input"
import { FilaInset, ListaInset } from "@/componentes/ui/listaInset"
import { useVinculados } from "@/hooks/useVinculados"
import { useVolver } from "@/hooks/useVolver"
import { fechaISO } from "@/lib/fecha"
import { moverEnOrden } from "@/lib/orden"
import { planMedio } from "@/lib/reasignar"
import { semillaDeTarjeta } from "@/lib/recordatorios"
import { uuidv4 } from "@/lib/uuid"
import { cn } from "@/lib/utils"

interface Medio {
  id: string
  name: string
  kind: string
  last4: string | null
  brand: string | null
  closing_day: number | null
  due_day: number | null
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
  // A donde se vino (Inicio, Accesos, Ajustes o un atajo), no a un lugar fijo.
  const volver = useVolver("/ajustes")
  const db = usePowerSync()
  const { data: medios } = useQuery<Medio>(
    "SELECT id, name, kind, last4, brand, closing_day, due_day, archived FROM payment_methods WHERE deleted_at IS NULL ORDER BY archived, sort_order, created_at",
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

  const { porTarjeta } = useVinculados()
  const [mostrarForm, setMostrarForm] = useState(false)
  const [editando, setEditando] = useState<Medio | null>(null)
  // Se cierra sola si el medio ya no esta (se elimino desde su edicion).
  const editandoVigente = editando !== null && medios.some((m) => m.id === editando.id)
  const [avisando, setAvisando] = useState<Medio | null>(null)
  const [accion, setAccion] = useState<{ tipo: "archivar" | "eliminar"; m: Medio } | null>(null)
  const [reasignando, setReasignando] = useState<Medio | null>(null)
  const [ordenando, setOrdenando] = useState(false)

  async function archivar(m: Medio, valor: number) {
    await db.execute("UPDATE payment_methods SET archived = ? WHERE id = ?", [valor, m.id])
  }
  async function borrar(m: Medio) {
    await db.execute("DELETE FROM payment_methods WHERE id = ?", [m.id])
  }

  function alTacho(m: Medio) {
    // En uso: se ofrece mover lo que lo referencia a otro medio.
    if (enUso.has(m.id)) setReasignando(m)
    else setAccion({ tipo: "eliminar", m })
  }

  function destinosDe(m: Medio) {
    return medios
      .filter((x) => x.id !== m.id && !x.archived)
      .map((x) => ({ id: x.id, nombre: x.name }))
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
    const aviso = porTarjeta.get(m.id)
    const ordenable = ordenando && i !== undefined
    // Tocar la fila lo edita; ahi estan "Avisarme", archivar y eliminar (y en
    // escritorio, archivar y eliminar tambien sobre la fila con el mouse).
    return (
      <FilaInset
        key={m.id}
        onClick={ordenable ? undefined : () => setEditando(m)}
        chevron={!ordenable}
        acciones={
          ordenable ? undefined : (
            <AccionesFila
              nombre={m.name}
              archivada={m.archived === 1}
              onArchivar={() => alArchivar(m)}
              onEliminar={() => alTacho(m)}
            />
          )
        }
      >
        <div className="min-w-0">
          <p className={cn("break-words font-medium", m.archived && "text-muted-foreground")}>
            {m.name}
            {m.last4 ? ` ····${m.last4}` : ""}
          </p>
          {/* Sin cortar: el dia de vencimiento importa (lo sigue "Avisarme"). */}
          <p className="break-words text-xs text-muted-foreground">
            {KINDS[m.kind] ?? m.kind}
            {m.brand ? ` · ${m.brand}` : ""}
            {m.kind === "credit_card" && m.closing_day ? ` · cierra ${m.closing_day}` : ""}
            {m.kind === "credit_card" && m.due_day ? ` · vence ${m.due_day}` : ""}
          </p>
        </div>
        {ordenable ? (
          <div className="flex shrink-0 items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Subir ${m.name}`}
              disabled={i === 0}
              onClick={() => mover(m, -1)}
            >
              <ChevronUp className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Bajar ${m.name}`}
              disabled={i === activos.length - 1}
              onClick={() => mover(m, 1)}
            >
              <ChevronDown className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          // Ya tiene aviso del vencimiento: se ve desde la lista.
          aviso && (
            <BellRing
              className="h-4 w-4 shrink-0 text-muted-foreground"
              role="img"
              aria-label="Con aviso del vencimiento"
            />
          )
        )}
      </FilaInset>
    )
  }

  return (
    <div className="mx-auto max-w-xl space-y-4 p-4">
      <EncabezadoPantalla
        titulo="Medios de pago"
        volver={volver}
        acciones={
          // Ordenando, "Listo" reemplaza a las demas (como "OK" en iOS).
          ordenando ? (
            <Button size="sm" onClick={() => setOrdenando(false)}>
              Listo
            </Button>
          ) : (
            <>
              {activos.length > 1 && (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Ordenar"
                  title="Ordenar"
                  onClick={() => setOrdenando(true)}
                >
                  <ArrowUpDown className="h-5 w-5" />
                </Button>
              )}
              <BotonNuevo etiqueta="Nuevo medio" onClick={() => setMostrarForm(true)} />
            </>
          )
        }
      />

      <Hoja abierta={mostrarForm} onOpenChange={setMostrarForm} titulo="Nuevo medio">
        <FormularioMedio onCerrar={() => setMostrarForm(false)} />
      </Hoja>
      <Hoja
        abierta={editandoVigente}
        onOpenChange={(v) => !v && setEditando(null)}
        titulo="Editar medio"
      >
        {editando && (
          <FormularioMedio
            key={editando.id}
            inicial={editando}
            onCerrar={() => setEditando(null)}
          />
        )}
        {editando && (
          <AccionesEdicion
            archivada={editando.archived === 1}
            onArchivar={() => {
              alArchivar(editando)
              // Desarchivar es directo: la edicion ya no tiene nada que hacer.
              if (editando.archived) setEditando(null)
            }}
            onEliminar={() => alTacho(editando)}
          >
            {/* "Avisarme" (1.6.0): una tarjeta de credito en uso, con dia de
                vencimiento. Se abre encima de la edicion. */}
            {editando.kind === "credit_card" && editando.due_day !== null && !editando.archived && (
              <Button
                variant="ghost"
                className="justify-start"
                onClick={() => setAvisando(editando)}
              >
                {porTarjeta.get(editando.id) ? (
                  <BellRing className="h-4 w-4" aria-hidden />
                ) : (
                  <BellPlus className="h-4 w-4" aria-hidden />
                )}
                {porTarjeta.get(editando.id)
                  ? "Recordatorio del vencimiento"
                  : "Avisarme del vencimiento"}
              </Button>
            )}
          </AccionesEdicion>
        )}
      </Hoja>
      {avisando?.due_day && (
        <HojaAvisarme
          existente={porTarjeta.get(avisando.id)}
          semilla={semillaDeTarjeta(
            { ...avisando, due_day: avisando.due_day },
            fechaISO(new Date()),
          )}
          onCerrar={() => setAvisando(null)}
        />
      )}

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
          setEditando(null)
        }}
      />
      {reasignando && (
        <HojaReasignar
          abierta
          onOpenChange={(v) => {
            if (!v) setReasignando(null)
          }}
          titulo="Eliminar y mover"
          nombre={reasignando.name}
          detalle={(() => {
            const n = movs.get(reasignando.id) ?? 0
            return n > 0
              ? `sus ${n} movimiento${n === 1 ? "" : "s"} y todo lo que lo use`
              : "todo lo que lo use"
          })()}
          destinos={destinosDe(reasignando)}
          plan={(destino) => planMedio(reasignando.id, destino)}
        />
      )}
    </div>
  )
}

// Alta o edicion (`inicial`) de un medio. El tipo se elige al crearlo: el
// servidor no lo deja cambiar.
function FormularioMedio({ inicial, onCerrar }: { inicial?: Medio; onCerrar: () => void }) {
  const db = usePowerSync()
  const [name, setName] = useState(inicial?.name ?? "")
  const [kind, setKind] = useState(inicial?.kind ?? "debit_card")
  const [last4, setLast4] = useState(inicial?.last4 ?? "")
  const [brand, setBrand] = useState(inicial?.brand ?? "")
  const [cierre, setCierre] = useState(inicial?.closing_day ? String(inicial.closing_day) : "")
  const [vence, setVence] = useState(inicial?.due_day ? String(inicial.due_day) : "")
  const [error, setError] = useState("")

  // Dia del mes 1..31, o null. Vacio o fuera de rango => null.
  const dia = (v: string): number | null => {
    const n = Number(v)
    return v.trim() && n >= 1 && n <= 31 ? n : null
  }

  async function guardar() {
    if (!name.trim()) return setError("Poné un nombre")
    const credito = kind === "credit_card"
    try {
      if (inicial) {
        // Si cambia el dia de vencimiento, el servidor corre su recordatorio.
        await db.execute(
          "UPDATE payment_methods SET name = ?, last4 = ?, brand = ?, closing_day = ?, due_day = ? WHERE id = ?",
          [
            name.trim(),
            last4.trim() || null,
            brand.trim() || null,
            credito ? dia(cierre) : null,
            credito ? dia(vence) : null,
            inicial.id,
          ],
        )
        onCerrar()
        return
      }
      await db.execute(
        "INSERT INTO payment_methods (id, name, kind, last4, brand, closing_day, due_day, archived) VALUES (?, ?, ?, ?, ?, ?, ?, 0)",
        [
          uuidv4(),
          name.trim(),
          kind,
          last4.trim() || null,
          brand.trim() || null,
          credito ? dia(cierre) : null,
          credito ? dia(vence) : null,
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
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Débito 8027" />
      </Campo>
      <div className="grid grid-cols-2 gap-3">
        {inicial ? (
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Tipo</p>
            <p className="flex min-h-11 items-center text-sm">{KINDS[kind] ?? kind}</p>
          </div>
        ) : (
          <Campo etiqueta="Tipo">
            <SelectorEntidad
              titulo="Tipo de medio"
              placeholder="Elegí un tipo"
              opciones={Object.entries(KINDS).map(([v, l]) => ({ id: v, nombre: l }))}
              valor={kind}
              onCambio={setKind}
            />
          </Campo>
        )}
        <Campo etiqueta="Últimos 4 (opcional)">
          <Input
            value={last4}
            onChange={(e) => setLast4(e.target.value.replace(/\D/g, ""))}
            maxLength={4}
          />
        </Campo>
      </div>
      <Campo etiqueta="Marca (opcional)">
        <Input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Visa" />
      </Campo>
      {/* Fechas solo para tarjeta de credito (fase 5): cierre y vencimiento. */}
      {kind === "credit_card" && (
        <div className="grid grid-cols-2 gap-3">
          <Campo etiqueta="Día de cierre">
            <Input
              value={cierre}
              onChange={(e) => setCierre(e.target.value.replace(/\D/g, ""))}
              inputMode="numeric"
              maxLength={2}
              placeholder="25"
            />
          </Campo>
          <Campo etiqueta="Día de vencimiento">
            <Input
              value={vence}
              onChange={(e) => setVence(e.target.value.replace(/\D/g, ""))}
              inputMode="numeric"
              maxLength={2}
              placeholder="5"
            />
          </Campo>
        </div>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button className="flex-1" onClick={guardar}>
          Guardar
        </Button>
        <Button variant="secondary" onClick={onCerrar}>
          Cancelar
        </Button>
      </div>
    </div>
  )
}
