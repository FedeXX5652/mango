import { ChevronLeft, ChevronRight, Receipt } from "lucide-react"
import { useMemo, useState } from "react"
import { useSearchParams } from "react-router-dom"

import { EncabezadoEspacio } from "@/componentes/SelectorEspacio"
import { Vacio } from "@/componentes/Vacio"
import { ConPanel } from "@/componentes/ConPanel"
import { FilaHistoria, HojaPago } from "@/componentes/grupo/Historia"
import { Button } from "@/componentes/ui/button"
import { ListaInset } from "@/componentes/ui/listaInset"
import { Select } from "@/componentes/ui/select"
import { type PagoGrupo, armarHistoria, useGrupo } from "@/hooks/useGrupo"
import { ordenarJerarquico } from "@/lib/categorias"
import { useGrupoDeRuta } from "@/hooks/useEspacio"
import { CargandoGrupo, GrupoNoEncontrado } from "@/pantallas/grupo/comun"
import { claveDia, etiquetaDia } from "@/lib/fecha"

// Movimientos de un grupo (0026): los gastos compartidos de TODOS los miembros
// con los pagos entre ellos intercalados, por mes y agrupados por dia. Lo ajeno
// se abre en solo lectura (solo lo edita quien lo cargo).
export function MovimientosGrupo() {
  const { id, grupo, cargando } = useGrupoDeRuta()
  const datos = useGrupo(id)
  // El mes y los filtros viven en la URL (?mes=2026-09&quien=…&categoria=…):
  // al entrar a un gasto y volver, la lista queda donde estaba. Antes se
  // reiniciaba al mes actual (0026: el estado de la pantalla, en la direccion).
  const [params, setParams] = useSearchParams()
  const hoy = new Date()
  const [anioParam, mesParam] = (params.get("mes") ?? "").split("-").map(Number)
  const anio = anioParam || hoy.getFullYear()
  const mes = mesParam ? mesParam - 1 : hoy.getMonth()
  const quien = params.get("quien") ?? ""
  const categoriaId = params.get("categoria") ?? ""
  const [pago, setPago] = useState<PagoGrupo | null>(null)

  function cambiar(clave: string, valor: string) {
    const nuevos = new URLSearchParams(params)
    if (valor) nuevos.set(clave, valor)
    else nuevos.delete(clave)
    setParams(nuevos, { replace: true })
  }

  const desde = new Date(anio, mes, 1).toISOString()
  const hasta = new Date(anio, mes + 1, 1).toISOString()
  const etiquetaMes = new Date(anio, mes, 1).toLocaleDateString("es-AR", {
    month: "long",
    year: "numeric",
  })

  const porDia = useMemo(() => {
    // Un filtro de categoria es de gastos: los pagos no tienen categoria.
    const gastos = datos.gastos.filter(
      (g) =>
        g.occurred_at >= desde &&
        g.occurred_at < hasta &&
        (!quien || g.owner_id === quien) &&
        (!categoriaId || g.category_id === categoriaId),
    )
    const pagos = categoriaId
      ? []
      : datos.pagos.filter(
          (p) =>
            p.occurred_at >= desde &&
            p.occurred_at < hasta &&
            (!quien || p.from_user_id === quien || p.to_user_id === quien),
        )
    // Los aportes a la conjunta tampoco tienen categoria; "quien" es quien puso.
    const aportes = categoriaId
      ? []
      : datos.aportes.filter(
          (a) =>
            a.occurred_at >= desde && a.occurred_at < hasta && (!quien || a.owner_id === quien),
        )
    const grupos = new Map<string, ReturnType<typeof armarHistoria>>()
    for (const it of armarHistoria(gastos, pagos, aportes)) {
      const dia = claveDia(it.fecha)
      grupos.set(dia, [...(grupos.get(dia) ?? []), it])
    }
    return [...grupos.entries()]
  }, [datos.gastos, datos.pagos, datos.aportes, desde, hasta, quien, categoriaId])

  if (cargando) return <CargandoGrupo />
  if (!grupo) return <GrupoNoEncontrado />

  function cambiarMes(d: number) {
    const f = new Date(anio, mes + d, 1)
    cambiar("mes", `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, "0")}`)
  }

  const categoriasGasto = ordenarJerarquico(datos.categorias)
  const nombreCat = new Map(datos.categorias.map((c) => [c.id, c.name]))

  return (
    <ConPanel etiqueta="Detalle del movimiento">
      <div className="mx-auto max-w-2xl space-y-3 p-4">
        <EncabezadoEspacio />
        <h1 className="text-2xl font-semibold">Movimientos</h1>

        <div className="flex items-center justify-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => cambiarMes(-1)}
            aria-label="Mes anterior"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <span className="min-w-40 text-center text-sm font-medium first-letter:uppercase">
            {etiquetaMes}
          </span>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => cambiarMes(1)}
            aria-label="Mes siguiente"
          >
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Select
            aria-label="Quién"
            value={quien}
            onChange={(e) => cambiar("quien", e.target.value)}
          >
            <option value="">Todos</option>
            {datos.miembros.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {datos.nombre(m.user_id)}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Categoría"
            value={categoriaId}
            onChange={(e) => cambiar("categoria", e.target.value)}
          >
            <option value="">Toda categoría</option>
            {categoriasGasto.map((c) => (
              <option key={c.id} value={c.id}>
                {c.parent_id ? `${nombreCat.get(c.parent_id) ?? "—"} › ${c.name}` : c.name}
              </option>
            ))}
          </Select>
        </div>

        {porDia.length === 0 ? (
          <Vacio
            icono={Receipt}
            titulo="Nada este mes"
            detalle={
              quien || categoriaId
                ? "No hay movimientos con estos filtros."
                : "Cuando alguien cargue un gasto compartido o se registre un pago, aparece acá."
            }
          />
        ) : (
          porDia.map(([dia, items]) => (
            <section key={dia} className="space-y-1">
              {/* El mismo encabezado que Movimientos personal ("Hoy", "Ayer"…). */}
              <h2 className="px-1 text-xs font-medium text-muted-foreground">
                {etiquetaDia(items[0].fecha)}
              </h2>
              <ListaInset>
                {items.map((it) => (
                  <FilaHistoria
                    key={`${it.tipo}-${it.id}`}
                    item={it}
                    groupId={id}
                    miId={datos.miId}
                    miembros={datos.miembros}
                    splitsDe={datos.splitsDe}
                    categoria={datos.categoria}
                    nombre={datos.nombre}
                    onPago={setPago}
                    conFecha={false}
                  />
                ))}
              </ListaInset>
            </section>
          ))
        )}

        <HojaPago pago={pago} nombre={datos.nombre} onClose={() => setPago(null)} />
      </div>
    </ConPanel>
  )
}
