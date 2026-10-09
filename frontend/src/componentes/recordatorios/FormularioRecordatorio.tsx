import { usePowerSync, useQuery } from "@powersync/react"
import { Plus, Trash2 } from "lucide-react"
import { useState } from "react"

import { SelectorEntidad } from "@/componentes/SelectorEntidad"
import { SelectorRepeticion } from "@/componentes/recordatorios/SelectorRepeticion"
import { Button } from "@/componentes/ui/button"
import { Campo } from "@/componentes/ui/campo"
import { Confirmar } from "@/componentes/ui/confirmar"
import { Input } from "@/componentes/ui/input"
import { OpcionesRadio } from "@/componentes/ui/opcionesRadio"
import { Select } from "@/componentes/ui/select"
import { formatearMonto } from "@/lib/dinero"
import { fechaISO } from "@/lib/fecha"
import {
  type Aviso,
  type CamposRegla,
  NO_SE_REPITE,
  type RecordatorioLocal,
  type Repeticion,
  avisosDe,
  borrarRecordatorio,
  guardarRecordatorio,
  puedeCaerEnFinde,
  reglaDe,
  repeticionDe,
} from "@/lib/recordatorios"
import type { CorrimientoFinde } from "@/lib/repeticion"

// Alta y edicion de un recordatorio (1.5.0, 0030).

interface PlantillaLocal {
  id: string
  name: string
  amount: number | null
  currency: string | null
}

const POR_DEFECTO: Aviso[] = [{ days_before: 0, time: "09:00" }]

const ANTICIPACION = [
  { valor: 0, etiqueta: "El mismo día" },
  { valor: 1, etiqueta: "1 día antes" },
  { valor: 2, etiqueta: "2 días antes" },
  { valor: 3, etiqueta: "3 días antes" },
  { valor: 5, etiqueta: "5 días antes" },
  { valor: 7, etiqueta: "1 semana antes" },
  { valor: 14, etiqueta: "2 semanas antes" },
]

// "" = hasta que responda (NULL en la base).
const SEGUIMIENTO = [
  { valor: "0", etiqueta: "No, solo el día que vence" },
  { valor: "1", etiqueta: "1 día más" },
  { valor: "3", etiqueta: "3 días más" },
  { valor: "7", etiqueta: "Una semana más" },
  { valor: "", etiqueta: "Hasta que responda" },
]

const FINDE: { valor: CorrimientoFinde; etiqueta: string }[] = [
  { valor: "none", etiqueta: "Queda ese día" },
  { valor: "next", etiqueta: "Pasa al lunes" },
  { valor: "previous", etiqueta: "Se adelanta al viernes" },
]

function camposDe(r: RecordatorioLocal): CamposRegla {
  return {
    freq: r.freq,
    interval_count: r.interval_count,
    weekdays: r.weekdays,
    month_mode: r.month_mode,
    month_day: r.month_day,
    month_week: r.month_week,
    month_weekday: r.month_weekday,
    start_date: r.start_date,
    until_date: r.until_date,
    count: r.count,
  }
}

export function FormularioRecordatorio({
  inicial,
  onCerrar,
}: {
  inicial?: RecordatorioLocal
  onCerrar: () => void
}) {
  const db = usePowerSync()
  const hoy = fechaISO(new Date())
  const { data: plantillas } = useQuery<PlantillaLocal>(
    "SELECT id, name, amount, currency FROM templates WHERE deleted_at IS NULL ORDER BY sort_order, name",
  )

  const [titulo, setTitulo] = useState(inicial?.title ?? "")
  const [plantillaId, setPlantillaId] = useState(inicial?.template_id ?? "")
  const [fecha, setFecha] = useState(inicial?.start_date ?? hoy)
  const [rep, setRep] = useState<Repeticion>(inicial ? repeticionDe(inicial) : NO_SE_REPITE)
  // Un recordatorio guardado conserva su regla tal cual mientras no se toque la
  // fecha ni la repeticion (puede venir de otro lado, con valores que la pantalla
  // no arma).
  const [tocada, setTocada] = useState(!inicial)
  const [finde, setFinde] = useState<CorrimientoFinde | "">(inicial?.weekend_shift ?? "")
  const [avisos, setAvisos] = useState<Aviso[]>(inicial ? avisosDe(inicial) : POR_DEFECTO)
  const [seguimiento, setSeguimiento] = useState(
    inicial ? (inicial.followup_days === null ? "" : String(inicial.followup_days)) : "3",
  )
  const [notas, setNotas] = useState(inicial?.notes ?? "")
  const [error, setError] = useState("")
  const [guardando, setGuardando] = useState(false)
  const [borrando, setBorrando] = useState(false)

  const regla = tocada || !inicial ? reglaDe(fecha, rep) : camposDe(inicial)
  const preguntaFinde = puedeCaerEnFinde(regla)

  function cambiarAviso(i: number, cambio: Partial<Aviso>) {
    setAvisos((lista) => lista.map((a, j) => (j === i ? { ...a, ...cambio } : a)))
  }

  function agregarAviso() {
    // El siguiente que no este: un dia antes, despues tres...
    const usados = new Set(avisos.map((a) => a.days_before))
    const libre = ANTICIPACION.find((a) => !usados.has(a.valor))?.valor ?? 0
    setAvisos((lista) => [...lista, { days_before: libre, time: "09:00" }])
  }

  async function guardar() {
    setError("")
    if (!titulo.trim()) return setError("Poné qué hay que pagar")
    if (preguntaFinde && !finde) return setError("Elegí qué pasa si cae sábado o domingo")
    // La fecha de fin se elige en "Personalizar"; si despues se movio el primer
    // vencimiento, puede haber quedado antes. El servidor la rechazaria.
    if (regla.until_date && regla.until_date < regla.start_date)
      return setError("La repetición termina antes del primer vencimiento: cambiá la fecha de fin")
    // A cualquier hora (2026-10-08: se saco la franja de 8 a 22).
    if (avisos.some((a) => !/^\d\d:\d\d$/.test(a.time)))
      return setError("Falta la hora de un aviso")
    setGuardando(true)
    try {
      await guardarRecordatorio(
        db,
        {
          ...regla,
          title: titulo.trim(),
          notes: notas.trim() || null,
          template_id: plantillaId || null,
          weekend_shift: preguntaFinde && finde ? finde : "none",
          // Del mas anticipado al dia del vencimiento.
          alerts: [...avisos].sort(
            (a, b) => b.days_before - a.days_before || a.time.localeCompare(b.time),
          ),
          followup_days: seguimiento === "" ? null : Number(seguimiento),
        },
        hoy,
        inicial,
      )
      onCerrar()
    } catch {
      setError("No se pudo guardar")
      setGuardando(false)
    }
  }

  async function borrar() {
    if (!inicial) return
    await borrarRecordatorio(db, inicial.id)
    setBorrando(false)
    onCerrar()
  }

  const opcionesSeguimiento = SEGUIMIENTO.some((o) => o.valor === seguimiento)
    ? SEGUIMIENTO
    : [...SEGUIMIENTO, { valor: seguimiento, etiqueta: `${seguimiento} días más` }]

  return (
    <div className="space-y-4">
      <Campo etiqueta="Qué hay que pagar">
        <Input
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          placeholder="Alquiler, tarjeta, expensas…"
          maxLength={120}
        />
      </Campo>

      <Campo etiqueta={rep.freq === "once" ? "Vence" : "Primer vencimiento"}>
        <Input
          type="date"
          value={fecha}
          onChange={(e) => {
            if (!e.target.value) return
            setFecha(e.target.value)
            setTocada(true)
          }}
        />
      </Campo>

      <SelectorRepeticion
        fecha={fecha}
        valor={rep}
        onCambio={(r) => {
          setRep(r)
          setTocada(true)
        }}
      />

      {preguntaFinde && (
        <OpcionesRadio
          nombre="finde"
          etiqueta="Si cae sábado o domingo"
          opciones={FINDE}
          valor={finde}
          onCambio={(v) => {
            setFinde(v)
            setError("")
          }}
        />
      )}

      <div className="space-y-1">
        <Campo etiqueta="Plantilla para cargar el pago (opcional)">
          <SelectorEntidad
            titulo="Plantilla"
            placeholder="Sin plantilla"
            vacio="Sin plantilla"
            opciones={plantillas.map((t) => ({
              id: t.id,
              nombre: t.name,
              detalle: t.amount ? formatearMonto(t.amount, { moneda: t.currency ?? "ARS" }) : null,
            }))}
            valor={plantillaId}
            onCambio={setPlantillaId}
          />
        </Campo>
        <p className="text-xs text-muted-foreground">
          El monto, la cuenta y la categoría del pago salen de la plantilla.
        </p>
      </div>

      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm text-muted-foreground">Avisos</legend>
        {avisos.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Sin avisos: se ve en el calendario, pero no te avisa.
          </p>
        )}
        {avisos.map((a, i) => (
          <div key={i} className="flex items-center gap-2">
            <Select
              aria-label={`Aviso ${i + 1}: cuándo`}
              value={String(a.days_before)}
              onChange={(e) => cambiarAviso(i, { days_before: Number(e.target.value) })}
              className="flex-1"
            >
              {ANTICIPACION.map((o) => (
                <option key={o.valor} value={o.valor}>
                  {o.etiqueta}
                </option>
              ))}
            </Select>
            <Input
              type="time"
              aria-label={`Aviso ${i + 1}: hora`}
              value={a.time}
              onChange={(e) => cambiarAviso(i, { time: e.target.value })}
              className="w-32 tabular"
            />
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Quitar el aviso ${i + 1}`}
              onClick={() => setAvisos((lista) => lista.filter((_, j) => j !== i))}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        {avisos.length < 10 && (
          <Button variant="outline" size="sm" onClick={agregarAviso}>
            <Plus className="h-4 w-4" />
            Agregar aviso
          </Button>
        )}
      </fieldset>

      <Campo etiqueta="Si no respondés, seguir avisando">
        <Select value={seguimiento} onChange={(e) => setSeguimiento(e.target.value)}>
          {opcionesSeguimiento.map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.etiqueta}
            </option>
          ))}
        </Select>
      </Campo>

      <Campo etiqueta="Nota (opcional)">
        <Input value={notas} onChange={(e) => setNotas(e.target.value)} maxLength={1000} />
      </Campo>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button className="flex-1" disabled={guardando} onClick={guardar}>
          Guardar
        </Button>
        <Button variant="outline" onClick={onCerrar}>
          Cancelar
        </Button>
      </div>
      {inicial && (
        <Button
          variant="ghost"
          className="w-full text-destructive"
          onClick={() => setBorrando(true)}
        >
          <Trash2 className="h-4 w-4" />
          Eliminar recordatorio
        </Button>
      )}
      {inicial && (
        <Confirmar
          abierta={borrando}
          onOpenChange={setBorrando}
          titulo={`¿Eliminar «${inicial.title}»?`}
          detalle="Deja de avisar. Lo que ya pagaste queda en tus movimientos."
          etiqueta="Eliminar"
          destructivo
          onConfirmar={borrar}
        />
      )}
    </div>
  )
}
