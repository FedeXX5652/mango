import { useQuery } from "@powersync/react"
import { CalendarClock, HandCoins, PiggyBank, Users } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { useState } from "react"
import { Link, useNavigate } from "react-router-dom"

import { HojaNuevaConjunta } from "@/componentes/CuentaConjunta"
import { DeA } from "@/componentes/DeA"
import { SaldarPago, type Liquidacion } from "@/componentes/SaldarPago"
import { Button } from "@/componentes/ui/button"
import { Hoja } from "@/componentes/ui/hoja"
import { FilaInset, ListaInset } from "@/componentes/ui/listaInset"
import { useGrupo } from "@/hooks/useGrupo"
import { formatearMonto } from "@/lib/dinero"
import { rutaEspacio, rutaMoverPlata } from "@/lib/espacios"

// Accesos del Inicio de un grupo (0026): lo que se HACE con el grupo, a un
// toque. Son fijos (no se eligen como los personales, 0024): un grupo tiene
// pocas acciones y todas son de uso frecuente. Mismo estilo de baldosa que el
// panel personal.
const BALDOSA =
  "flex min-h-20 w-full flex-col items-center justify-start gap-2 rounded-xl px-1 py-2 text-center text-xs font-medium leading-tight transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"

function Icono({ icono: I }: { icono: LucideIcon }) {
  return (
    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent text-accent-foreground">
      <I className="h-5 w-5" aria-hidden />
    </span>
  )
}

export function AccesosGrupo({ groupId }: { groupId: string }) {
  const navigate = useNavigate()
  const { balance, miId, nombre } = useGrupo(groupId)
  const { data: conjuntas } = useQuery<{ id: string }>(
    "SELECT id FROM accounts WHERE group_id = ? AND deleted_at IS NULL AND archived = 0",
    [groupId],
  )
  const [verSaldar, setVerSaldar] = useState(false)
  const [pagando, setPagando] = useState<Liquidacion | null>(null)
  const [crearConjunta, setCrearConjunta] = useState(false)

  // Como saldar, con lo que me toca primero.
  const liquidaciones: Liquidacion[] = balance
    .flatMap((r) => r.liquidaciones.map((l) => ({ ...l, currency: r.currency })))
    .sort((x, y) => Number(esMia(y, miId)) - Number(esMia(x, miId)))
  const mias = liquidaciones.filter((l) => esMia(l, miId))

  function saldar() {
    // Una sola deuda que me toca: directo al pago. Si no, la lista.
    if (mias.length === 1) setPagando(mias[0])
    else setVerSaldar(true)
  }

  function ponerPlata() {
    // Sin conjunta no hay donde poner: primero se crea, y se sigue con ella.
    if (conjuntas.length === 0) setCrearConjunta(true)
    else
      navigate(
        rutaMoverPlata(groupId, "poner", conjuntas.length === 1 ? conjuntas[0].id : undefined),
      )
  }

  const ajustes = rutaEspacio({ tipo: "grupo", id: groupId }, "ajustes")

  return (
    <section aria-labelledby="titulo-accesos-grupo" className="space-y-3">
      <h2 id="titulo-accesos-grupo" className="text-sm font-semibold text-muted-foreground">
        Accesos
      </h2>
      <ul className="grid grid-cols-4 gap-1">
        <li>
          <button type="button" onClick={saldar} className={BALDOSA}>
            <Icono icono={HandCoins} />
            Saldar
          </button>
        </li>
        <li>
          <button type="button" onClick={ponerPlata} className={BALDOSA}>
            <Icono icono={PiggyBank} />
            Poner plata
          </button>
        </li>
        <li>
          <Link to={`${ajustes}#miembros`} className={BALDOSA}>
            <Icono icono={Users} />
            Miembros
          </Link>
        </li>
        {/* "Calendario" reemplaza a "Categorías", que sigue en Ajustes del grupo
            (1.6.0, G2): pagar lo del grupo es usarlo; las categorías, administrarlo. */}
        <li>
          <Link to={`/grupos/${groupId}/calendario`} className={BALDOSA}>
            <Icono icono={CalendarClock} />
            Calendario
          </Link>
        </li>
      </ul>

      <Hoja abierta={verSaldar} onOpenChange={setVerSaldar} titulo="Saldar">
        {liquidaciones.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Están al día: nadie le debe nada a nadie en el grupo.
          </p>
        ) : (
          <ListaInset>
            {liquidaciones.map((l, i) => (
              <FilaInset key={i}>
                <span className="min-w-0 text-sm">
                  <DeA
                    de={nombre(l.de)}
                    a={nombre(l.a)}
                    flecha="le debe a"
                    className="font-medium"
                  />
                  <span className="tabular block text-xs text-muted-foreground">
                    {formatearMonto(l.monto, { moneda: l.currency })}
                  </span>
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setVerSaldar(false)
                    setPagando(l)
                  }}
                >
                  Saldar
                </Button>
              </FilaInset>
            ))}
          </ListaInset>
        )}
      </Hoja>

      <SaldarPago
        groupId={groupId}
        liquidacion={pagando}
        miId={miId}
        nombre={nombre}
        onClose={() => setPagando(null)}
      />

      <HojaNuevaConjunta
        groupId={groupId}
        abierta={crearConjunta}
        onOpenChange={setCrearConjunta}
        detalle="Para poner plata, el grupo necesita una cuenta conjunta: la plata que hay ahí es de todos."
        onCreada={(id) => navigate(rutaMoverPlata(groupId, "poner", id))}
      />
    </section>
  )
}

function esMia(l: Liquidacion, miId: string): boolean {
  return l.de === miId || l.a === miId
}
