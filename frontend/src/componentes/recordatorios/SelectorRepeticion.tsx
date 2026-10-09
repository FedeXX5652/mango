import { ChevronRight } from "lucide-react"
import { useId, useState } from "react"

import { Button } from "@/componentes/ui/button"
import { Campo } from "@/componentes/ui/campo"
import { Hoja } from "@/componentes/ui/hoja"
import { Input } from "@/componentes/ui/input"
import { type OpcionRadio, OpcionesRadio } from "@/componentes/ui/opcionesRadio"
import { Segmentado } from "@/componentes/ui/segmentado"
import {
  type FinRepeticion,
  type ModoMensual,
  NO_SE_REPITE,
  type Repeticion,
  diaDelMes,
  esUltimaSemana,
  reglaDe,
  semanaDelMes,
} from "@/lib/recordatorios"
import {
  type Frecuencia,
  ORDINALES,
  aDia,
  describir,
  diaDeSemana,
  nombreDia,
} from "@/lib/repeticion"
import { cn } from "@/lib/utils"

// Repetir, como en Samsung Reminder (1.5.0, 0030): atajos que salen de la fecha
// ("Todos los meses, el día 10") y "Personalizar" para el resto. Todo es relativo
// a la fecha: cambiarla cambia el dia que se repite.

type Atajo = "once" | "daily" | "weekly" | "monthly" | "yearly"

const BASE: Repeticion = { ...NO_SE_REPITE }

const ATAJOS: Record<Atajo, Repeticion> = {
  once: BASE,
  daily: { ...BASE, freq: "daily" },
  weekly: { ...BASE, freq: "weekly" },
  monthly: { ...BASE, freq: "monthly" },
  yearly: { ...BASE, freq: "yearly" },
}

// El atajo que es `rep`, o null si es una personalizada.
function atajoDe(rep: Repeticion, fecha: string): Atajo | null {
  const simple = rep.intervalo === 1 && rep.fin === "nunca"
  if (!simple) return null
  if (rep.freq === "weekly") {
    const delDia = 1 << diaDeSemana(aDia(fecha))
    return rep.dias === 0 || rep.dias === delDia ? "weekly" : null
  }
  if (rep.freq === "monthly") {
    // El 31 es "el último día": guardado, vuelve como tal, y es el mismo atajo.
    const delDia =
      rep.mensual === "dia" || (rep.mensual === "ultimo-dia" && diaDelMes(fecha) === 31)
    return delDia ? "monthly" : null
  }
  return rep.freq
}

export function SelectorRepeticion({
  fecha,
  valor,
  onCambio,
}: {
  fecha: string
  valor: Repeticion
  onCambio: (r: Repeticion) => void
}) {
  const id = useId()
  const [abierta, setAbierta] = useState(false)
  const [personalizando, setPersonalizando] = useState(false)
  const texto = describir(reglaDe(fecha, valor))

  function abrir() {
    setPersonalizando(false)
    setAbierta(true)
  }

  const atajo = atajoDe(valor, fecha)
  const opciones: OpcionRadio<Atajo | "custom">[] = (
    ["once", "daily", "weekly", "monthly", "yearly"] as Atajo[]
  ).map((a) => ({ valor: a, etiqueta: describir(reglaDe(fecha, ATAJOS[a])) }))
  opciones.push({
    valor: "custom",
    etiqueta: "Personalizar…",
    detalle: atajo === null ? texto : undefined,
  })

  return (
    <>
      {/* El nombre del boton es la etiqueta MAS el valor ("Repetir, Todos los
          meses, el día 10"): dentro de un <label>, el lector de pantalla solo
          diria "Repetir". */}
      <div className="space-y-2">
        <span id={`${id}-etiqueta`} className="block text-sm text-muted-foreground">
          Repetir
        </span>
        <button
          type="button"
          onClick={abrir}
          aria-labelledby={`${id}-etiqueta ${id}-valor`}
          className="flex h-11 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:h-10"
        >
          <span id={`${id}-valor`} className="truncate">
            {texto}
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        </button>
      </div>
      <Hoja abierta={abierta} onOpenChange={setAbierta} titulo="Repetir">
        {personalizando ? (
          <Personalizar
            fecha={fecha}
            inicial={valor.freq === "once" ? { ...valor, freq: "daily" } : valor}
            onListo={(r) => {
              onCambio(r)
              setAbierta(false)
            }}
            onVolver={() => setPersonalizando(false)}
          />
        ) : (
          <OpcionesRadio
            nombre="repetir"
            etiqueta="Cada cuánto"
            opciones={opciones}
            valor={atajo ?? "custom"}
            onCambio={(v) => {
              if (v === "custom") return setPersonalizando(true)
              onCambio(ATAJOS[v])
              setAbierta(false)
            }}
          />
        )}
      </Hoja>
    </>
  )
}

const UNIDADES: { valor: Frecuencia; etiqueta: string }[] = [
  { valor: "daily", etiqueta: "Días" },
  { valor: "weekly", etiqueta: "Semanas" },
  { valor: "monthly", etiqueta: "Meses" },
  { valor: "yearly", etiqueta: "Años" },
]

const INICIALES = ["L", "M", "M", "J", "V", "S", "D"]

function Personalizar({
  fecha,
  inicial,
  onListo,
  onVolver,
}: {
  fecha: string
  inicial: Repeticion
  onListo: (r: Repeticion) => void
  onVolver: () => void
}) {
  const id = useId()
  const [rep, setRep] = useState<Repeticion>(inicial)
  const cambiar = (c: Partial<Repeticion>) => setRep((r) => ({ ...r, ...c }))
  const delDia = 1 << diaDeSemana(aDia(fecha))
  const dias = rep.dias || delDia

  function alternarDia(i: number) {
    const otra = dias ^ (1 << i)
    // Siempre queda al menos un dia.
    if (otra !== 0) cambiar({ dias: otra })
  }

  const dia = Number(fecha.slice(8, 10))
  const nombre = nombreDia(diaDeSemana(aDia(fecha)))
  // El 31 ya es "el último día" (en los meses cortos cae en el ultimo): no se
  // ofrecen las dos.
  const mensuales: OpcionRadio<ModoMensual>[] =
    dia === 31 ? [] : [{ valor: "dia", etiqueta: `El día ${dia}` }]
  const semana = semanaDelMes(fecha)
  if (semana > 0) {
    mensuales.push({ valor: "enesimo", etiqueta: `El ${ORDINALES[semana]} ${nombre}` })
  }
  if (esUltimaSemana(fecha)) {
    mensuales.push({ valor: "ultimo-de-la-semana", etiqueta: `El último ${nombre}` })
  }
  mensuales.push({ valor: "ultimo-dia", etiqueta: "El último día del mes" })
  // Si lo elegido no esta para esta fecha (se cambio la fecha), vuelve al dia de
  // la fecha, que para el 31 es el ultimo.
  const porDefecto: ModoMensual = dia === 31 ? "ultimo-dia" : "dia"
  const mensual = mensuales.some((m) => m.valor === rep.mensual) ? rep.mensual : porDefecto

  const fines: OpcionRadio<FinRepeticion>[] = [
    { valor: "nunca", etiqueta: "Nunca" },
    { valor: "veces", etiqueta: "Después de una cantidad de veces" },
    { valor: "fecha", etiqueta: "En una fecha" },
  ]

  const final: Repeticion = { ...rep, mensual, dias: rep.freq === "weekly" ? dias : 0 }
  const error =
    final.fin === "fecha" && (!final.hasta || final.hasta < fecha)
      ? "Elegí una fecha de fin posterior al primer vencimiento"
      : ""

  return (
    <div className="space-y-4">
      {/* El numero y la unidad en dos filas: a 360 px las cuatro unidades al lado
          del numero se pegaban. */}
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <label htmlFor={`${id}-cada`} className="text-sm text-muted-foreground">
            Cada
          </label>
          <Input
            id={`${id}-cada`}
            type="number"
            inputMode="numeric"
            min={1}
            max={99}
            value={rep.intervalo}
            onChange={(e) =>
              cambiar({ intervalo: Math.min(99, Math.max(1, Number(e.target.value) || 1)) })
            }
            className="w-20 tabular"
          />
        </div>
        <Segmentado
          etiqueta="Unidad"
          opciones={UNIDADES}
          valor={rep.freq === "once" ? "daily" : rep.freq}
          onCambio={(f) => cambiar({ freq: f })}
        />
      </div>

      {rep.freq === "weekly" && (
        <fieldset>
          <legend className="mb-2 text-sm text-muted-foreground">Los días</legend>
          <div className="grid grid-cols-7 gap-1">
            {INICIALES.map((letra, i) => {
              const elegido = (dias & (1 << i)) !== 0
              return (
                <button
                  key={i}
                  type="button"
                  aria-pressed={elegido}
                  aria-label={nombreDia(i)}
                  onClick={() => alternarDia(i)}
                  className={cn(
                    "h-11 rounded-md border text-sm font-medium transition-colors lg:h-10",
                    elegido
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-input bg-background hover:bg-muted",
                  )}
                >
                  {letra}
                </button>
              )
            })}
          </div>
        </fieldset>
      )}

      {rep.freq === "monthly" && (
        <OpcionesRadio
          nombre="mensual"
          etiqueta="Qué día del mes"
          opciones={mensuales}
          valor={mensual}
          onCambio={(m) => cambiar({ mensual: m })}
        />
      )}

      <OpcionesRadio
        nombre="fin"
        etiqueta="Termina"
        opciones={fines}
        valor={rep.fin}
        onCambio={(f) => cambiar({ fin: f })}
      />
      {rep.fin === "veces" && (
        <Campo etiqueta="Cuántas veces">
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            max={999}
            value={rep.veces}
            onChange={(e) =>
              cambiar({ veces: Math.min(999, Math.max(1, Number(e.target.value) || 1)) })
            }
            className="w-28 tabular"
          />
        </Campo>
      )}
      {rep.fin === "fecha" && (
        <Campo etiqueta="Hasta el">
          <Input
            type="date"
            min={fecha}
            value={rep.hasta}
            onChange={(e) => cambiar({ hasta: e.target.value })}
          />
        </Campo>
      )}

      <p className="rounded-md bg-muted px-3 py-2 text-sm" aria-live="polite">
        {describir(reglaDe(fecha, final))}
      </p>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button className="flex-1" disabled={!!error} onClick={() => onListo(final)}>
          Listo
        </Button>
        <Button variant="outline" onClick={onVolver}>
          Volver
        </Button>
      </div>
    </div>
  )
}
