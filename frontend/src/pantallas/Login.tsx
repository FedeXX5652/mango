import { useState } from "react"

import { Button } from "@/componentes/ui/button"
import { Campo } from "@/componentes/ui/campo"
import { Input } from "@/componentes/ui/input"
import { useSesion } from "@/hooks/sesion"
import { ApiError, api } from "@/lib/api"

// Login de servidor (fase 3a). Usuario + clave, sin mail. Si la cuenta tiene
// clave temporal (must_change_password), después del login se fuerza el cambio,
// que maneja `CambioForzado`.
//
// Es lo primero que se ve si no hay sesión: sin esto no se monta PowerSync ni se
// ve ningún dato.
export function Login({ onEntrar }: { onEntrar: (mustChange: boolean) => void }) {
  const { entrar } = useSesion()
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [cargando, setCargando] = useState(false)

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    if (!username.trim() || !password) return
    setCargando(true)
    setError("")
    try {
      const r = await api.login(username.trim(), password)
      entrar(r.token)
      onEntrar(r.must_change_password)
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        setError("Demasiados intentos. Esperá unos minutos.")
      } else {
        setError("Usuario o contraseña incorrectos.")
      }
      setCargando(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 p-6">
      <div className="text-center">
        <h1 className="text-3xl font-semibold">Mango</h1>
        <p className="mt-1 text-sm text-muted-foreground">Entrá con tu usuario y clave.</p>
      </div>
      <form onSubmit={enviar} className="space-y-3">
        <Campo etiqueta="Usuario">
          <Input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
            autoComplete="username"
            autoCapitalize="none"
          />
        </Campo>
        <Campo etiqueta="Contraseña">
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </Campo>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button
          type="submit"
          className="w-full"
          disabled={cargando || !username.trim() || !password}
        >
          {cargando ? "Entrando…" : "Entrar"}
        </Button>
      </form>
    </div>
  )
}

// Cambio de clave obligatorio: la cuenta entró con una clave temporal puesta por
// el admin (reset sin mail). No se puede hacer nada hasta cambiarla.
export function CambioForzado({ onListo }: { onListo: () => void }) {
  const { salir } = useSesion()
  const [actual, setActual] = useState("")
  const [nueva, setNueva] = useState("")
  const [repetir, setRepetir] = useState("")
  const [error, setError] = useState("")
  const [cargando, setCargando] = useState(false)

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    if (nueva.length < 8) return setError("La clave nueva necesita al menos 8 caracteres.")
    if (nueva !== repetir) return setError("Las dos claves nuevas no coinciden.")
    setCargando(true)
    setError("")
    try {
      await api.cambiarClave(actual, nueva)
      onListo()
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 400
          ? "La clave temporal no coincide."
          : "No se pudo cambiar. Probá de nuevo.",
      )
      setCargando(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 p-6">
      <div className="text-center">
        <h1 className="text-2xl font-semibold">Elegí tu contraseña</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Entraste con una clave temporal. Cambiala para seguir.
        </p>
      </div>
      <form onSubmit={enviar} className="space-y-3">
        <Campo etiqueta="Clave temporal">
          <Input
            type="password"
            value={actual}
            onChange={(e) => setActual(e.target.value)}
            autoFocus
          />
        </Campo>
        <Campo etiqueta="Clave nueva">
          <Input type="password" value={nueva} onChange={(e) => setNueva(e.target.value)} />
        </Campo>
        <Campo etiqueta="Repetir la nueva">
          <Input type="password" value={repetir} onChange={(e) => setRepetir(e.target.value)} />
        </Campo>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" className="w-full" disabled={cargando}>
          {cargando ? "Guardando…" : "Cambiar y entrar"}
        </Button>
        <Button type="button" variant="ghost" className="w-full" onClick={salir}>
          Cancelar y salir
        </Button>
      </form>
    </div>
  )
}
