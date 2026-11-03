import { Check, ChevronRight } from "lucide-react"
import { useId, useMemo, useState } from "react"

import { useEtiquetaDeCampo } from "@/componentes/ui/campoContexto"
import { Hoja } from "@/componentes/ui/hoja"
import { Input } from "@/componentes/ui/input"
import { ListaInset } from "@/componentes/ui/listaInset"
import { iconoDe } from "@/lib/iconos"
import { cn } from "@/lib/utils"

// Elegir una opcion de una lista, con la pinta de Mango.
//
// **El desplegable de un `<select>` nativo no se puede estilar**: lo dibuja el
// sistema operativo, no la pagina. Existe un estandar nuevo para eso
// (`appearance: base-select`) que todavia no funciona en varios navegadores muy
// usados, asi que la unica forma de que la lista se vea como el resto de la app
// es dibujarla nosotros.
//
// En el telefono el nativo igual se ve bien —abre la rueda de iOS o el dialogo
// de Android—, asi que esto no arregla un problema de movil: arregla el de
// escritorio y de paso deja **una sola** forma de elegir en los dos.
//
// Cuando son hasta cuatro opciones de una palabra, esto no va: va `Segmentado`,
// que las muestra todas sin abrir nada (ver DESIGN.md 7).

export interface OpcionEntidad {
  id: string
  nombre: string
  // Segunda linea: la moneda de una cuenta, el tipo de un medio de pago.
  detalle?: string | null
  // Clave del catalogo de lib/iconos.
  icono?: string | null
  // Para listas jerarquicas (categoria y subcategoria).
  sangria?: boolean
  // Un titulo de seccion, no una opcion (la categoria madre que tiene hijas,
  // 1.14.0). No se elige ni se busca.
  titulo?: boolean
}

// A partir de cuantas opciones aparece el buscador. Con pocas estorba: son
// todas visibles de un vistazo.
const MINIMO_BUSCADOR = 8

export function SelectorEntidad({
  opciones,
  valor,
  onCambio,
  titulo,
  placeholder,
  vacio,
  vacioSinOpciones = "No hay opciones todavía.",
  frecuentes = [],
  className,
}: {
  opciones: OpcionEntidad[]
  valor: string
  onCambio: (id: string) => void
  // Encabezado de la hoja.
  titulo: string
  // Texto cuando no hay nada elegido.
  placeholder: string
  // Opcion para no elegir ninguna ("Sin medio", "Toda cuenta"). Sin esto, la
  // eleccion es obligatoria.
  vacio?: string
  // Lo que dice la hoja cuando no hay ninguna opcion (no cuando la busqueda no
  // encontro nada): que falta y, si se puede, donde se crea.
  vacioSinOpciones?: string
  // Las mas usadas, arriba y a un toque, mientras no se busca (1.14.0).
  frecuentes?: OpcionEntidad[]
  className?: string
}) {
  const [abierta, setAbierta] = useState(false)
  const [busqueda, setBusqueda] = useState("")
  // Dentro de un `Campo`, el nombre es su etiqueta mas el valor ("Cuenta,
  // Efectivo"): si no, el lector de pantalla solo decia "Cuenta" (1.7.0).
  const idEtiqueta = useEtiquetaDeCampo()
  const idValor = useId()

  const elegida = opciones.find((o) => o.id === valor) ?? null

  const visibles = useMemo(() => {
    const q = sinTildes(busqueda)
    if (!q) return opciones
    return opciones.filter(
      (o) => !o.titulo && sinTildes(`${o.nombre} ${o.detalle ?? ""}`).includes(q),
    )
  }, [opciones, busqueda])

  const conBuscador = opciones.length >= MINIMO_BUSCADOR
  const Actual = iconoDe(elegida?.icono)
  const muestraIcono = opciones.some((o) => o.icono !== undefined)

  function elegir(id: string) {
    onCambio(id)
    setAbierta(false)
  }

  return (
    <>
      <button
        type="button"
        aria-labelledby={idEtiqueta ? `${idEtiqueta} ${idValor}` : undefined}
        onClick={() => {
          setBusqueda("")
          setAbierta(true)
        }}
        // Los mismos tokens que `ui/select`: en un formulario tiene que verse
        // como un campo mas. Lo unico distinto es la flecha, y a proposito:
        // `›` abre un panel, `▾` despliega en el lugar.
        className={cn(
          "flex h-11 w-full items-center gap-3 rounded-md lg:h-10 border border-input bg-background px-3 text-left text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          className,
        )}
      >
        {elegida ? (
          <>
            {muestraIcono && (
              // eslint-disable-next-line react-hooks/static-components
              <Actual className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            )}
            <span id={idValor} className="min-w-0 flex-1 truncate">
              {elegida.nombre}
              {elegida.detalle && (
                <span className="text-muted-foreground"> · {elegida.detalle}</span>
              )}
            </span>
          </>
        ) : (
          <span id={idValor} className="min-w-0 flex-1 truncate text-muted-foreground">
            {vacio ?? placeholder}
          </span>
        )}
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      </button>

      <Hoja abierta={abierta} onOpenChange={setAbierta} titulo={titulo}>
        <div className="space-y-3">
          {/* Fijo arriba: la hoja entera scrollea, no una caja adentro (1.14.0:
              la lista quedaba cortada debajo del buscador). */}
          {conBuscador && (
            <div className="sticky top-0 z-10 -mx-1 bg-card px-1 pb-1">
              <Input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar"
                aria-label={`Buscar en ${titulo.toLowerCase()}`}
              />
            </div>
          )}
          {frecuentes.length > 0 && !busqueda && (
            <section aria-label="Frecuentes" className="space-y-2">
              <h3 className="text-xs font-semibold text-muted-foreground">Frecuentes</h3>
              <div className="flex flex-wrap gap-2">
                {frecuentes.map((o) => (
                  <Chip key={o.id} o={o} elegida={o.id === valor} onElegir={() => elegir(o.id)} />
                ))}
              </div>
            </section>
          )}
          <div>
            {/* Lista vacia y busqueda sin resultados no son lo mismo: "Ninguna
                coincide" sin haber buscado nada no se entendia. */}
            {opciones.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">{vacioSinOpciones}</p>
            ) : visibles.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Ninguna coincide.</p>
            ) : (
              <ListaInset>
                {vacio && !busqueda && (
                  <Fila
                    o={{ id: "", nombre: vacio }}
                    elegida={valor === ""}
                    conIcono={false}
                    onElegir={() => elegir("")}
                    apagada
                  />
                )}
                {visibles.map((o) =>
                  o.titulo ? (
                    <Titulo key={o.id} o={o} />
                  ) : (
                    <Fila
                      key={o.id}
                      o={o}
                      elegida={o.id === valor}
                      conIcono={muestraIcono}
                      // Buscando no se sangra: la madre puede no estar entre los
                      // resultados y la sangria colgaria de la nada.
                      sangria={Boolean(o.sangria) && !busqueda}
                      onElegir={() => elegir(o.id)}
                    />
                  ),
                )}
              </ListaInset>
            )}
          </div>
        </div>
      </Hoja>
    </>
  )
}

function Fila({
  o,
  elegida,
  conIcono,
  sangria,
  apagada,
  onElegir,
}: {
  o: OpcionEntidad
  elegida: boolean
  conIcono: boolean
  sangria?: boolean
  apagada?: boolean
  onElegir: () => void
}) {
  // `iconoDe` busca en un Map estatico, no crea un componente (ver lib/iconos).
  const Icono = iconoDe(o.icono)
  return (
    <button
      type="button"
      onClick={onElegir}
      aria-pressed={elegida}
      className="flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-muted"
    >
      {conIcono && (
        // El icono en un circulo de marca, como en Accesos (1.14.0): antes era
        // un trazo gris que no se distinguia.
        <span
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground",
            sangria && "ml-6",
          )}
        >
          {/* eslint-disable-next-line react-hooks/static-components */}
          <Icono className="h-4 w-4" aria-hidden />
        </span>
      )}
      <span className={cn("min-w-0 flex-1", !conIcono && sangria && "pl-6")}>
        <span
          className={cn(
            "block truncate text-sm",
            elegida && "font-medium",
            apagada && "text-muted-foreground",
          )}
        >
          {o.nombre}
        </span>
        {/* En una lista sangrada el detalle es la madre, que la sangria ya
            muestra: repetirlo en cada fila es ruido. */}
        {o.detalle && !sangria && (
          <span className="block truncate text-xs text-muted-foreground">{o.detalle}</span>
        )}
      </span>
      {elegida && <Check className="h-4 w-4 shrink-0 text-enlace" aria-hidden />}
    </button>
  )
}

// La madre de un grupo de hijas: un titulo dentro de la lista, no una opcion.
function Titulo({ o }: { o: OpcionEntidad }) {
  return (
    <div className="bg-muted/50 px-3 pb-1 pt-3 text-xs font-semibold text-muted-foreground">
      {o.nombre}
    </div>
  )
}

function Chip({
  o,
  elegida,
  onElegir,
}: {
  o: OpcionEntidad
  elegida: boolean
  onElegir: () => void
}) {
  const Icono = iconoDe(o.icono)
  return (
    <button
      type="button"
      onClick={onElegir}
      aria-pressed={elegida}
      className={cn(
        "flex min-h-11 items-center gap-2 rounded-full border border-border bg-background px-3 text-sm transition-colors hover:bg-muted",
        elegida && "border-enlace font-medium",
      )}
    >
      {o.icono !== undefined && (
        // eslint-disable-next-line react-hooks/static-components
        <Icono className="h-4 w-4 shrink-0 text-accent-foreground" aria-hidden />
      )}
      {o.nombre}
    </button>
  )
}

function sinTildes(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim()
}
