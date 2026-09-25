# 0013 - Autenticación (fase 3a)

Estado: aceptada
Fecha: 2026-09-25

## Contexto

Hasta acá el backend no tenía auth: `get_current_user_id` devolvía siempre el
usuario semilla, y cualquiera que llegara al puerto leía y escribía todo. El
cliente tenía un PIN, pero es un lock de **dispositivo**, no identidad de
servidor. Fase 3a introduce el login real, que además es la precondición de los
grupos (3b).

Self-hosted y familiar: las cuentas las crea quien administra, no hay registro
abierto ni mail (ver ESPECIFICACION §7).

## Decisión

### Identidad: username, no email

El mail sirve para probar que sos dueño de una dirección, algo que importa con
registro abierto. Acá el admin crea las cuentas y ya sabe quién es cada uno, así
que la identidad es **username + clave**. La columna `email` se renombró a
`username` por expandir/contraer (0012): se agregó `username`, se rellenó desde
la parte local del email, `email` quedó opcional y se borra en un release
futuro. Login case-insensitive en el username.

### Clave: Argon2id

`argon2-cffi`. Sobre bcrypt porque es el recomendado hoy, resistente a GPU y sin
el tope de 72 bytes. **Hashear no es encriptar**: no hay vuelta atrás ni con la
clave del servidor, y eso es lo que se quiere. El placeholder `"!"` del semilla
no es un hash válido, así que nunca deja entrar. En cada login exitoso se
re-hashea si los parámetros quedaron viejos.

### Dos tokens

- **Sesión**: la emite el login, la manda el cliente como `Bearer` en cada
  llamada. Firmada con `secret_key`.
- **PowerSync**: corta (1h), la firma la API a partir de una sesión válida, la
  valida el servicio de sync. Otra clave.

Distintos porque los valida distinta gente y viven distinto tiempo.

### Sesión hasta cerrar sesión

Decisión de producto: la sesión no se renueva ni vence en la práctica. Se le
pone un `exp` de un año como red (un token no puede ser literalmente inmortal),
pero se corta con el **logout**, que borra el token del dispositivo y hace
`disconnectAndClear` de PowerSync para no dejar rastro de la sesión anterior. Un
401 en cualquier request también borra el token y manda a login.

El token vive en localStorage, no en cookie httpOnly, porque el conector de
PowerSync lo lee desde JS. El costo es XSS; detrás de Tailscale y con el PIN,
aceptable. Revocación del lado del servidor de una sesión robada es hardening
futuro.

### Reset sin mail: clave temporal

El admin corre `python -m app.reset_password <username> [temporal]` en el
servidor: pone una clave temporal y marca `must_change_password`. La persona
entra con ella y el cliente **obliga a cambiarla antes de hacer nada**.

Se descartó "dejar la cuenta sin clave y que la app pida crear una": mientras
está sin clave, quien abra primero se la queda, y saber que está sin clave
requeriría una consulta sin autenticar que enumera usuarios reseteables.

### Límite de intentos

Tras 5 fallos por username, bloqueo de 5 minutos. En memoria (una sola
instancia; reiniciar limpia, aceptable). Sin esto, sin mail ni 2FA, la clave es
lo único que frena la prueba por fuerza bruta.

### El PIN convive

El PIN (lock de dispositivo) no se toca. Orden: **sesión** (¿quién sos para el
servidor?) → **PIN** (desbloqueo rápido del día a día) → PowerSync. Bloquear
pide el PIN; cerrar sesión borra los datos locales y exige la clave de nuevo.

## Consecuencias

- Toda la API exige `Bearer` ahora. Las pruebas de la API sobreescriben el dep
  de auth (no mandan token); el camino real del token lo cubre `test_auth`.
- **El `secret_key` de producción tiene que ser largo** (≥ 32 bytes): con el
  default de dev, PyJWT avisa que la clave HMAC es corta. `.env.example` ya lo
  genera con `openssl rand -hex 32`.
- No publicar la API fuera del tailnet: el login mitiga, pero el transporte en
  LAN pelada sigue en claro hasta que haya TLS o se entre por Tailscale también
  desde casa.
- El primer caso real de expandir/contraer (0012) es este renombre: un release
  futuro borra `email`.
