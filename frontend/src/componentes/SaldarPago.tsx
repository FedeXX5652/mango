import { usePowerSync, useQuery } from "@powersync/react"
import { useState } from "react"

import { SelectorEntidad } from "@/componentes/SelectorEntidad"
import { Button } from "@/componentes/ui/button"
import { Campo } from "@/componentes/ui/campo"
import { Hoja } from "@/componentes/ui/hoja"
import { Input } from "@/componentes/ui/input"
import { Segmentado } from "@/componentes/ui/segmentado"
import { aCentavos, formatearMonto } from "@/lib/dinero"
import { uuidv4 } from "@/lib/uuid"

// Saldar una deuda del grupo (fase 3b.3, ver 0017). Dos formas:
//   - "Marcar saldado": queda registrado y reversible, NO mueve plata (se salda
//     por fuera, o es una deuda chica que dan por saldada).
//   - "Registrar pago": solo si soy el deudor. Sale de MI cuenta y medio, y se
//     puede pagar por partes (monto editable, <= la deuda).
// En los dos casos se ajusta el balance del grupo; el segundo, ademas, baja mi
// saldo (la plata salio de mi cuenta).

export interface Liquidacion {
  de: string
  a: string
  monto: number
  currency: string
}

export function SaldarPago({
  groupId,
  liquidacion,
  miId,
  nombre,
  onClose,
}: {
  groupId: string
  liquidacion: Liquidacion | null
  miId: string
  nombre: (userId: string) => string
  onClose: () => void
}) {
  const db = usePowerSync()
  const soyDeudor = liquidacion?.de === miId

  const { data: cuentas } = useQuery<{ id: string; name: string; currency: string }>(
    "SELECT id, name, currency FROM accounts WHERE owner_id IS NOT NULL AND deleted_at IS NULL AND archived = 0 ORDER BY sort_order, name",
  )
  const { data: medios } = useQuery<{ id: string; name: string }>(
    "SELECT id, name FROM payment_methods WHERE deleted_at IS NULL AND archived = 0 ORDER BY name",
  )

  const [modo, setModo] = useState<"marcar" | "pagar">("marcar")
  const [monto, setMonto] = useState("")
  const [cuentaId, setCuentaId] = useState("")
  const [medioId, setMedioId] = useState("")
  const [error, setError] = useState("")

  // Reset al abrir con una liquidacion nueva.
  const [ultimaKey, setUltimaKey] = useState<string | null>(null)
  const key = liquidacion ? `${liquidacion.de}-${liquidacion.a}-${liquidacion.monto}` : null
  if (key !== ultimaKey) {
    setUltimaKey(key)
    setModo("marcar")
    setMonto(liquidacion ? (liquidacion.monto / 100).toString().replace(".", ",") : "")
    setCuentaId("")
    setMedioId("")
    setError("")
  }

  if (!liquidacion) return null
  const { de, a, monto: sugerido, currency } = liquidacion

  async function guardar() {
    setError("")
    const centavos = aCentavos(monto, currency) ?? 0
    if (centavos <= 0) return setError("Poné un monto")
    if (centavos > sugerido) return setError("No puede ser mayor a la deuda")
    const real = modo === "pagar"
    if (real && !cuentaId) return setError("Elegí la cuenta")
    await db.execute(
      `INSERT INTO settlements
         (id, group_id, from_user_id, to_user_id, amount, currency, occurred_at, created_by, account_id, payment_method_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuidv4(),
        groupId,
        de,
        a,
        centavos,
        currency,
        new Date().toISOString(),
        miId,
        real ? cuentaId : null,
        real && medioId ? medioId : null,
      ],
    )
    onClose()
  }

  const MODOS = [
    { valor: "marcar" as const, etiqueta: "Marcar saldado" },
    { valor: "pagar" as const, etiqueta: "Registrar pago" },
  ]

  return (
    <Hoja abierta onOpenChange={(v) => !v && onClose()} titulo="Saldar deuda">
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{nombre(de)}</span> le debe a{" "}
          <span className="font-medium text-foreground">{nombre(a)}</span>{" "}
          {formatearMonto(sugerido, { moneda: currency })}.
        </p>

        {soyDeudor && <Segmentado opciones={MODOS} valor={modo} onCambio={setModo} />}

        <Campo etiqueta="Monto a saldar">
          <Input
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            inputMode="decimal"
            className="tabular"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Podés saldar una parte: dejá menos que el total.
          </p>
        </Campo>

        {modo === "pagar" && soyDeudor && (
          <>
            <Campo etiqueta="Pagar desde">
              <SelectorEntidad
                titulo="Cuenta"
                placeholder="Elegí una cuenta"
                opciones={cuentas.map((c) => ({ id: c.id, nombre: c.name, detalle: c.currency }))}
                valor={cuentaId}
                onCambio={setCuentaId}
              />
            </Campo>
            <Campo etiqueta="Medio de pago (opcional)">
              <SelectorEntidad
                titulo="Medio de pago"
                placeholder="Sin medio"
                vacio="Sin medio"
                opciones={medios.map((m) => ({ id: m.id, nombre: m.name }))}
                valor={medioId}
                onCambio={setMedioId}
              />
            </Campo>
            <p className="text-xs text-muted-foreground">
              Sale de tu cuenta y baja tu saldo. Si en cambio ya se saldó por fuera, usá
              “Marcar saldado”.
            </p>
          </>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button className="w-full" onClick={guardar}>
          {modo === "pagar" && soyDeudor ? "Registrar pago" : "Marcar como saldado"}
        </Button>
      </div>
    </Hoja>
  )
}
