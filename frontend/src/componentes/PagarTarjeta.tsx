import { usePowerSync, useQuery } from "@powersync/react"
import { useMemo, useState } from "react"

import { CampoMonto } from "@/componentes/CampoMonto"
import { Calculadora } from "@/componentes/Calculadora"
import { SelectorEntidad } from "@/componentes/SelectorEntidad"
import { Button } from "@/componentes/ui/button"
import { Campo } from "@/componentes/ui/campo"
import { Hoja } from "@/componentes/ui/hoja"
import { Input } from "@/componentes/ui/input"
import { Segmentado } from "@/componentes/ui/segmentado"
import { useCotizaciones } from "@/hooks/useCotizaciones"
import type { SaldoTarjeta, Tarjeta } from "@/hooks/useTarjetas"
import { cotizarConDolar } from "@/lib/cotizaciones"
import { aCentavos, aTextoEditable, formatearMonto } from "@/lib/dinero"
import { fechaISO, formatearFechaCorta } from "@/lib/fecha"
import { convertir } from "@/lib/patrimonio"
import { responderCiclo } from "@/lib/recordatorios"
import { usuarioActualId } from "@/lib/sesion"
import { uuidv4 } from "@/lib/uuid"

// Pagar la tarjeta (0034): una transferencia hacia un saldo de la tarjeta, desde
// cualquier cuenta. La calculadora arranca en lo que se debe de ese saldo; se
// cambia para pagar una parte. Los pesos y los dolares se pagan por separado:
// si queda otro saldo por pagar, la hoja sigue abierta en ese.

const NOMBRE_MONEDA: Record<string, string> = {
  ARS: "Pesos",
  USD: "Dólares",
  EUR: "Euros",
  BRL: "Reales",
}
const nombreMoneda = (m: string) => NOMBRE_MONEDA[m] ?? m

interface CuentaOrigen {
  id: string
  name: string
  currency: string
}

export function PagarTarjeta({
  tarjeta,
  saldoInicial,
  ciclo,
  onCerrar,
}: {
  tarjeta: Tarjeta
  // Desde el recordatorio del vencimiento (0030): el primer pago lo deja pagado.
  ciclo?: { reminderId: string; nominal: string }
  // Que saldo se paga primero (su id); si no, el primero que se deba.
  saldoInicial?: string
  // `pagado`: se cargo al menos un pago.
  onCerrar: (pagado: boolean) => void
}) {
  const db = usePowerSync()
  const { indice, conv } = useCotizaciones()
  const hoy = fechaISO(new Date())

  const conDeuda = tarjeta.saldos.find((s) => s.estado.deuda > 0)
  const [saldoId, setSaldoId] = useState(saldoInicial ?? conDeuda?.id ?? tarjeta.saldos[0].id)
  const saldo: SaldoTarjeta = tarjeta.saldos.find((s) => s.id === saldoId) ?? tarjeta.saldos[0]
  const { estado } = saldo

  // Lo que arranca en la calculadora: el total, o el resumen si se elige.
  const [semilla, setSemilla] = useState<"total" | "resumen">("total")
  const inicial = semilla === "resumen" && estado.resumen != null ? estado.resumen : estado.deuda
  const [monto, setMonto] = useState(inicial)

  // Desde: cualquier cuenta mia que no sea una tarjeta.
  const { data: cuentas } = useQuery<CuentaOrigen>(
    `SELECT id, name, currency FROM accounts
     WHERE deleted_at IS NULL AND archived = 0 AND owner_id IS NOT NULL AND type <> 'credit_card'
     ORDER BY sort_order, created_at`,
  )
  // La cuenta del ultimo pago de este saldo: la sugerencia.
  const { data: ultimo } = useQuery<{ account_id: string }>(
    `SELECT account_id FROM transactions
     WHERE transfer_account_id = ? AND kind = 'transfer' AND deleted_at IS NULL
     ORDER BY occurred_at DESC LIMIT 1`,
    [saldo.id],
  )
  const sugerida = useMemo(() => {
    const previa = cuentas.find((c) => c.id === ultimo[0]?.account_id)
    return previa ?? cuentas.find((c) => c.currency === saldo.currency) ?? cuentas[0]
  }, [cuentas, ultimo, saldo.currency])
  // Lo que eligio la persona manda sobre la sugerencia.
  const [elegida, setElegida] = useState<string | null>(null)
  const origen = cuentas.find((c) => c.id === elegida) ?? sugerida

  // Pagar en otra moneda (dolares con pesos): se pide lo que debito el banco.
  // Arranca con el dolar tarjeta (0031); el dato del banco manda.
  const cruza = origen != null && origen.currency !== saldo.currency
  const propuesto = useMemo(() => {
    if (!cruza || !origen || monto <= 0) return null
    const c =
      cotizarConDolar(saldo.currency, origen.currency, indice, "tarjeta") ??
      conv(saldo.currency, origen.currency)
    return c ? convertir(monto, saldo.currency, origen.currency, c.rate) : null
  }, [cruza, origen, monto, saldo.currency, indice, conv])
  // Sigue a la propuesta mientras la persona no lo escribio a mano.
  const [escrito, setEscrito] = useState<string | null>(null)
  const debitado =
    escrito ?? (propuesto != null && origen ? aTextoEditable(propuesto, origen.currency) : "")
  const centavosDebitado = cruza && origen ? aCentavos(debitado, origen.currency) : null

  const [fecha, setFecha] = useState(hoy)
  const [error, setError] = useState("")
  const [aviso, setAviso] = useState("")
  const [guardando, setGuardando] = useState(false)
  const [pago, setPago] = useState(false)
  // Los saldos ya pagados en esta hoja: no se vuelve a ofrecer uno.
  const [pagados, setPagados] = useState<string[]>([])

  function elegirSaldo(id: string) {
    setSaldoId(id)
    setSemilla("total")
    setElegida(null)
    setEscrito(null)
    setError("")
    const s = tarjeta.saldos.find((x) => x.id === id)
    setMonto(s ? s.estado.deuda : 0)
  }
  function elegirSemilla(s: "total" | "resumen") {
    setSemilla(s)
    setMonto(s === "resumen" && estado.resumen != null ? estado.resumen : estado.deuda)
  }

  const fmt = (c: number, m = saldo.currency) => formatearMonto(c, { moneda: m })
  const nombre = tarjeta.saldos.length > 1 ? `${tarjeta.name} (${saldo.currency})` : tarjeta.name

  // Lo que se va a anotar, dicho antes de tocar "Pagar".
  function queSeAnota(): string {
    if (monto <= 0) return "Escribí cuánto pagás."
    if (!origen) return "Elegí desde qué cuenta pagás."
    const desde =
      cruza && centavosDebitado
        ? ` Se debitan ${fmt(centavosDebitado, origen.currency)} de ${origen.name}.`
        : ""
    const base = `Se anota una transferencia de ${fmt(monto)} de ${origen.name} a ${nombre}.${desde}`
    if (monto < estado.deuda) return `${base} Te queda por pagar ${fmt(estado.deuda - monto)}.`
    if (monto === estado.deuda) return `${base} La tarjeta queda saldada.`
    return `${base} Pagás ${fmt(monto - estado.deuda)} de más: la tarjeta queda a favor.`
  }

  async function pagar() {
    if (guardando) return
    setError("")
    if (monto <= 0) return setError("Escribí cuánto pagás")
    if (!origen) return setError("Elegí desde qué cuenta pagás")
    if (cruza && !centavosDebitado)
      return setError(`Escribí cuánto se debitó de ${origen.name} (${origen.currency})`)
    setGuardando(true)
    try {
      const idTx = uuidv4()
      await db.execute(
        // Una transferencia a la tarjeta, no un gasto (3.6). En otra moneda,
        // `amount` va en la de la tarjeta y `amount_account` en la de la cuenta
        // debitada (0005). Confirmado desde ya, como el ajuste de saldo.
        `INSERT INTO transactions
           (id, owner_id, kind, occurred_at, amount, currency, account_id, transfer_account_id,
            amount_account, visibility, status)
         VALUES (?, ?, 'transfer', ?, ?, ?, ?, ?, ?, 'private', 'confirmed')`,
        [
          idTx,
          usuarioActualId(),
          fecha === hoy ? new Date().toISOString() : new Date(`${fecha}T12:00:00`).toISOString(),
          monto,
          saldo.currency,
          origen.id,
          saldo.id,
          cruza ? centavosDebitado : null,
        ],
      )
      // El vencimiento queda pagado con el primer pago (como "Cargar el pago").
      if (ciclo && !pago) await responderCiclo(db, ciclo.reminderId, ciclo.nominal, "paid", idTx)
      setPago(true)
      setPagados((p) => [...p, saldo.id])
      // Queda otro saldo por pagar que todavia no se toco (los dolares): la hoja
      // sigue, en ese. Uno ya pagado aca no se vuelve a ofrecer.
      const otro = tarjeta.saldos.find(
        (s) => s.id !== saldo.id && !pagados.includes(s.id) && s.estado.deuda > 0,
      )
      if (otro) {
        setAviso(
          `Listo: pagaste ${fmt(monto)}. Te quedan ${fmt(otro.estado.deuda, otro.currency)} en ${nombreMoneda(otro.currency).toLowerCase()}.`,
        )
        elegirSaldo(otro.id)
        setGuardando(false)
        return
      }
      onCerrar(true)
    } catch {
      setError("No se pudo guardar el pago")
      setGuardando(false)
    }
  }

  return (
    <Hoja abierta onOpenChange={(v) => !v && onCerrar(pago)} titulo={`Pagar ${tarjeta.name}`}>
      <div className="space-y-4">
        {aviso && (
          <p role="status" className="rounded-md bg-muted p-3 text-sm">
            {aviso}
          </p>
        )}
        {tarjeta.saldos.length > 1 && (
          <Segmentado
            opciones={tarjeta.saldos.map((s) => ({
              valor: s.id,
              etiqueta: nombreMoneda(s.currency),
            }))}
            valor={saldo.id}
            onCambio={elegirSaldo}
            etiqueta="Qué saldo pagás"
          />
        )}
        <p className="text-sm text-muted-foreground">{explicacion(saldo, fmt)}</p>

        {/* Todo o el resumen: solo si el resumen es otra cosa que el total. Los
            montos estan en la frase de arriba; el amarillo es de "Pagar". */}
        {estado.resumen != null && estado.resumen > 0 && estado.resumen !== estado.deuda && (
          <Segmentado
            opciones={[
              { valor: "total", etiqueta: "Todo" },
              { valor: "resumen", etiqueta: "El resumen" },
            ]}
            valor={semilla}
            onCambio={elegirSemilla}
            etiqueta="Cuánto pagás"
          />
        )}

        <Calculadora
          key={`${saldo.id}-${semilla}`}
          moneda={saldo.currency}
          inicial={inicial}
          onCambio={setMonto}
        />

        <Campo etiqueta="Desde">
          <SelectorEntidad
            titulo="Desde qué cuenta pagás"
            placeholder="Elegí una cuenta"
            opciones={cuentas.map((c) => ({ id: c.id, nombre: c.name, detalle: c.currency }))}
            valor={origen?.id ?? ""}
            onCambio={(id) => {
              setElegida(id)
              setEscrito(null)
            }}
          />
        </Campo>

        {cruza && origen && (
          <Campo etiqueta={`Monto debitado de ${origen.name} (${origen.currency})`}>
            <CampoMonto
              moneda={origen.currency}
              value={debitado}
              onChange={setEscrito}
              className="tabular"
              placeholder="Lo que figura en el resumen del banco"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Propuesto con el dólar tarjeta. Si el banco debitó otra cosa, corregilo.
            </p>
          </Campo>
        )}

        <Campo etiqueta="Fecha">
          <Input
            type="date"
            value={fecha}
            max={hoy}
            onChange={(e) => setFecha(e.target.value || hoy)}
          />
        </Campo>

        <p role="status" className="text-sm">
          {queSeAnota()}
        </p>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <Button
            className="flex-1"
            disabled={monto <= 0 || guardando}
            onClick={() => void pagar()}
          >
            Pagar
          </Button>
          <Button variant="secondary" onClick={() => onCerrar(pago)}>
            {pago ? "Listo" : "Cancelar"}
          </Button>
        </div>
      </div>
    </Hoja>
  )
}

// Cuanto se debe y que vence, en una frase.
function explicacion(saldo: SaldoTarjeta, fmt: (c: number) => string): string {
  const { estado } = saldo
  if (estado.deuda === 0)
    return estado.aFavor > 0
      ? `No debés nada: la tarjeta tiene ${fmt(estado.aFavor)} a favor.`
      : "No debés nada en este saldo."
  const total = `Debés ${fmt(estado.deuda)}.`
  if (estado.resumen == null || !estado.cierre) return total
  const vence = estado.vence ? ` (vence el ${formatearFechaCorta(estado.vence)})` : ""
  if (estado.resumen === 0)
    return `${total} El resumen que cerró el ${formatearFechaCorta(estado.cierre)} ya está pagado: lo demás entra en el próximo.`
  return `${total} Del resumen que cerró el ${formatearFechaCorta(estado.cierre)}${vence}: ${fmt(estado.resumen)}.`
}
