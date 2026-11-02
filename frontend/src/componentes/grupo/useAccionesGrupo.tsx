import { useQuery } from "@powersync/react"
import { type ReactNode, useState } from "react"
import { useNavigate } from "react-router-dom"

import type { Acceso } from "@/componentes/accesos"
import { HojaNuevaConjunta } from "@/componentes/CuentaConjunta"
import { DeA } from "@/componentes/DeA"
import { SaldarPago, type Liquidacion } from "@/componentes/SaldarPago"
import { Button } from "@/componentes/ui/button"
import { Hoja } from "@/componentes/ui/hoja"
import { FilaInset, ListaInset } from "@/componentes/ui/listaInset"
import { useBloqueListo } from "@/hooks/bloquesListos"
import { useGrupo } from "@/hooks/useGrupo"
import { anunciar } from "@/lib/anuncios"
import { formatearMonto } from "@/lib/dinero"
import { rutaMoverPlata } from "@/lib/espacios"

// Las acciones de un grupo (saldar, poner y sacar plata): los accesos sin `to`.
// Las usan el panel del Inicio del grupo y su pantalla "Más" (1.13.0), que antes
// eran cosas distintas. `hojas` va en la pantalla que las usa.
export function useAccionesGrupo(groupId: string): {
  usar: (a: Acceso) => void
  // Por que una accion no se puede usar ahora, o null.
  motivo: (a: Acceso) => string | null
  hojas: ReactNode
} {
  const navigate = useNavigate()
  const { balance, miId, nombre, cargando } = useGrupo(groupId)
  const { data: conjuntas, isLoading: cargaConjuntas } = useQuery<{ id: string }>(
    "SELECT id FROM accounts WHERE group_id = ? AND deleted_at IS NULL AND archived = 0",
    [groupId],
  )
  useBloqueListo(cargando || cargaConjuntas)
  const [verSaldar, setVerSaldar] = useState(false)
  const [pagando, setPagando] = useState<Liquidacion | null>(null)
  const [crearConjunta, setCrearConjunta] = useState(false)

  // Como saldar, con lo que me toca primero.
  const liquidaciones: Liquidacion[] = balance
    .flatMap((r) => r.liquidaciones.map((l) => ({ ...l, currency: r.currency })))
    .sort((x, y) => Number(esMia(y, miId)) - Number(esMia(x, miId)))
  const mias = liquidaciones.filter((l) => esMia(l, miId))
  const unica = conjuntas.length === 1 ? conjuntas[0].id : undefined

  function usar(a: Acceso) {
    if (a.to) navigate(a.to)
    else if (a.id === "saldar") {
      // Una sola deuda que me toca: directo al pago. Si no, la lista.
      if (mias.length === 1) setPagando(mias[0])
      else setVerSaldar(true)
    } else if (a.id === "poner") {
      // Sin conjunta no hay donde poner: primero se crea, y se sigue con ella.
      if (conjuntas.length === 0) setCrearConjunta(true)
      else navigate(rutaMoverPlata(groupId, "poner", unica))
    } else if (a.id === "sacar") {
      if (conjuntas.length > 0) navigate(rutaMoverPlata(groupId, "sacar", unica))
      // Desde la baldosa no se ve el motivo: se dice.
      else anunciar("El grupo todavía no tiene cuenta conjunta: se crea con «Poner plata».")
    }
  }

  // Sacar plata sin conjunta no tiene de donde: se dice, en vez de un toque que
  // no hace nada.
  function motivo(a: Acceso): string | null {
    return a.id === "sacar" && conjuntas.length === 0
      ? "El grupo todavía no tiene cuenta conjunta"
      : null
  }

  const hojas = (
    <>
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
                  variant="secondary"
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
    </>
  )

  return { usar, motivo, hojas }
}

function esMia(l: Liquidacion, miId: string): boolean {
  return l.de === miId || l.a === miId
}
