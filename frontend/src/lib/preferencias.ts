import { db } from "@/lib/powersync/db"
import { usuarioActualId } from "@/lib/sesion"

// Las preferencias del usuario, leidas y escritas **en la base local**.
//
// Antes vivian solo en el servidor: se leian con `GET /users/me` y se guardaban
// con un PATCH, asi que cambiar el tema o la moneda base sin conexion no se
// podia, y no viajaban entre dispositivos. Desde que `users` entra a la
// sincronizacion —con las columnas contadas, sin el hash de la contraseña— son
// una tabla mas: se escriben local y suben cuando haya red.
//
// La fila es siempre una sola: la sync manda `WHERE id = auth.user_id()`.

export type EsquemaColor = "light" | "dark" | "system"

export interface Preferencias {
  id: string
  display_name: string
  base_currency: string
  theme_id: string
  color_scheme: EsquemaColor
  // Monedas que el usuario carga a mano (ver 0005). En Postgres es JSONB, asi
  // que baja como texto y se parsea aca.
  fx_manual: string[]
  // Accesos del panel de Inicio, en orden (0024). null = los de fabrica. Se
  // valida contra el catalogo en componentes/accesos (`normalizarAccesos`).
  home_shortcuts: string[] | null
}

interface Fila {
  id: string
  display_name: string
  base_currency: string
  theme_id: string
  color_scheme: string
  fx_manual: string | null
  home_shortcuts: string | null
}

// SIEMPRE filtrado por mi id. Desde 0021 la tabla `users` local tiene solo mi
// fila (los perfiles de los demas estan en `member_profiles`), pero el WHERE se
// queda: es lo que garantiza que un UPDATE nunca toque la fila de otra persona.
const SQL =
  "SELECT id, display_name, base_currency, theme_id, color_scheme, fx_manual, home_shortcuts FROM users WHERE id = ?"

// Una lista de strings guardada como JSON, o null si no hay o no es JSON.
export function listaJson(texto: string | null): string[] | null {
  if (!texto) return null
  try {
    const x = JSON.parse(texto)
    return Array.isArray(x) ? x.map(String) : null
  } catch {
    // Texto que no es JSON: se trata como "sin dato" en vez de romper la
    // pantalla. Es una preferencia, no un dato contable.
    return null
  }
}

function aPreferencias(f: Fila): Preferencias {
  return {
    id: f.id,
    display_name: f.display_name,
    base_currency: f.base_currency,
    theme_id: f.theme_id,
    color_scheme: (["light", "dark", "system"] as const).includes(f.color_scheme as EsquemaColor)
      ? (f.color_scheme as EsquemaColor)
      : "system",
    fx_manual: listaJson(f.fx_manual) ?? [],
    home_shortcuts: listaJson(f.home_shortcuts),
  }
}

// Una lectura suelta. Devuelve null si la fila todavia no bajo (primer arranque
// del dispositivo, antes de la primera sincronizacion) o si no hay sesion.
export async function leerPreferencias(): Promise<Preferencias | null> {
  const mi = usuarioActualId()
  if (!mi) return null
  const filas = await db.getAll<Fila>(SQL, [mi])
  return filas.length > 0 ? aPreferencias(filas[0]) : null
}

// Avisa con las preferencias actuales y cada vez que cambian, vengan de esta
// pantalla o de otro dispositivo. Devuelve la funcion para dejar de escuchar.
export function observarPreferencias(alCambiar: (p: Preferencias) => void): () => void {
  const mi = usuarioActualId()
  if (!mi) return () => {}
  const control = new AbortController()
  db.watch(
    SQL,
    [mi],
    {
      onResult: (r) => {
        const filas = (r.rows?._array ?? []) as Fila[]
        if (filas.length > 0) alCambiar(aPreferencias(filas[0]))
      },
    },
    { tables: ["users"], signal: control.signal },
  )
  return () => control.abort()
}

type Campos = Partial<Pick<Preferencias, "display_name" | "base_currency" | "theme_id">> & {
  color_scheme?: EsquemaColor
  fx_manual?: string[]
  // null = volver a los de fabrica.
  home_shortcuts?: string[] | null
  // "Más tarde" desde el botón del aviso (0030). null = 3 horas.
  snooze_default?: "1h" | "3h" | "manana" | null
}

// Escribe local; la sync lo sube despues. Sin fila todavia no hace nada: crear
// el usuario no es cosa del cliente.
export async function guardarPreferencias(campos: Campos): Promise<void> {
  const mi = usuarioActualId()
  if (!mi) return
  const entradas = Object.entries(campos).filter(([, v]) => v !== undefined)
  if (entradas.length === 0) return

  const sets = entradas.map(([k]) => `${k} = ?`).join(", ")
  // Las listas van como texto JSON (en SQLite no hay arrays); null queda null.
  const valores = entradas.map(([k, v]) =>
    k === "fx_manual" || k === "home_shortcuts"
      ? v === null
        ? null
        : JSON.stringify(v)
      : (v as string),
  )
  // WHERE id = mi: nunca tocar la fila de otro miembro (ver SQL arriba).
  await db.execute(`UPDATE users SET ${sets} WHERE id = ?`, [...valores, mi])
}
