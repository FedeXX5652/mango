# 0020 - Deploy por imagenes publicadas (GHCR) y una sola puerta de entrada

Estado: aceptada
Fecha: 2026-09-27

## Contexto

Hasta aca Mango se desplegaba **construyendo en el servidor**: el homelab tenia el
repo clonado y corria `docker compose up --build` (`build:` en el compose). Al
pensar la actualizacion automatica con **Watchtower** —que ya corre en el homelab
para el resto de las apps— aparecieron varios problemas:

1. **Watchtower no puede actualizar una imagen construida localmente.** Solo hace
   `pull` de una imagen de un registry y recrea el contenedor; no hace `git pull`
   ni `docker build`. Con `build:`, el codigo nuevo nunca llegaba solo.
2. **La URL de la API se horneaba en el frontend** (`VITE_API_URL` como build-arg):
   la imagen quedaba atada a un host y no se podia publicar una sola para todos.
3. **La config de PowerSync entraba por bind mount.** `compose up -d` no recrea un
   contenedor porque cambie el *contenido* de un archivo montado: tras un deploy
   que tocaba `sync-config.yaml`, PowerSync seguia con la config vieja (la nota de
   `infra/README.md` que decia lo contrario estaba mal). Es la misma familia que el
   bug de "la deuda que vuelve" de 0017.
4. **Los adjuntos (fase 5) se guardaban dentro del contenedor**: se habrian perdido
   en cada actualizacion.
5. **`SECRET_KEY` no se le pasaba al backend** en el compose: en docker corria con
   el valor de desarrollo, que firma las sesiones (0013).

El requisito: el flujo mas simple posible, **sin GitHub Actions ni servicios
pagos**, y que el servidor funcione como cualquier otra app dockerizable: bajar
imagenes y correrlas.

## Decision

### Imagenes publicadas; el servidor no tiene el repo

Mango se distribuye como **cuatro imagenes** en **GHCR** (GitHub Container
Registry, gratis; el repo es publico, asi que las imagenes tambien y el servidor
las baja sin login):

| Imagen | Que es |
|---|---|
| `mango-backend` | API FastAPI. **Migra la base al arrancar** (`alembic upgrade head`) y siembra lo que falte. |
| `mango-frontend` | La PWA en nginx, y la **puerta de entrada**: proxy a la API y a PowerSync. |
| `mango-powersync` | PowerSync oficial **con la config de sync adentro**. |
| `mango-backup` | `pg_dump` diario con retencion. |

El servidor tiene **solo** `deploy/docker-compose.yml` y un `.env`. Se instala
con `deploy/install.sh` (baja el compose, genera los secretos, levanta todo).

### Se publican a mano, desde la maquina de desarrollo

`make release` (o `sh scripts/release.sh`) arma las cuatro imagenes con `buildx` y
las sube con dos tags: el **commit** (fijo, para volver atras) y **`latest`** (el
que sigue el servidor). Exige el arbol limpio: una imagen tiene que corresponder
a un commit. Sin CI: es un comando en la PC.

Se descarto un hook `pre-push` que publique solo: acopla cada push a un deploy y
alarga el push. Se prefiere decidir cuando algo sale a produccion.

### Una sola puerta de entrada (mismo origen)

El nginx del frontend reparte `/api/` al backend y `/powersync/` a PowerSync. La
PWA le habla a **su mismo origen**, entonces:

- **no hay URL horneada**: la misma imagen sirve para cualquier host;
- **no hace falta CORS**;
- se publica **un solo puerto** (`MANGO_PORT`); bases, API y PowerSync quedan en la
  red interna de docker. Simplifica el TLS/Caddy del backlog: un solo destino.

Detalles que no pueden faltar en el proxy: `proxy_buffering off` y timeouts
largos para el stream de PowerSync, upgrade a WebSocket (el SDK puede usar
cualquiera de los dos), `client_max_body_size` para los adjuntos (el default de
nginx, 1 MB, devolveria 413) y el DNS de docker resuelto por request (sin eso
nginx no arranca si el backend todavia no existe, o queda con una IP vieja).

El SDK de PowerSync concatena `endpoint + ruta` (asi el prefijo `/powersync`
funciona), pero necesita el endpoint **absoluto y sin barra final**: la config
relativa se resuelve contra el origen de la pagina en el cliente (`lib/url`).

### Actualizacion: Watchtower (o `pull` a mano), con orden

- Las imagenes de Mango llevan `watchtower.enable=true`; las **bases**, `false`:
  reiniciar la DB es una decision, no algo que pase solo.
- `mango-powersync` depende de `mango-backend` (label `watchtower.depends-on`):
  cuando se actualiza el backend —que migra al arrancar— PowerSync se reinicia
  despues y relee esquema y config.
- Con la config **dentro** de la imagen de PowerSync, cambiar la config es
  publicar una imagen nueva: se termina el problema del bind mount.
- Las migraciones siguen **expandir/contraer** (0012): si un contenedor se
  actualiza unos segundos antes que otro, un cliente una version atras no rompe.

### Arreglos que venian con esto

- Volumen `mango-attachments` para los adjuntos.
- `SECRET_KEY` obligatoria: el compose de produccion falla sin ella, y el
  entrypoint del backend **no arranca** con el valor de desarrollo.
- `restart: unless-stopped` en todo (vuelve solo tras reiniciar el servidor).
- Volumenes con **nombre fijo** (`mango-pgdata`, ...): los datos no dependen del
  nombre de la carpeta.
- `.dockerignore` en frontend y backend: sin el, el `node_modules` de Windows
  pisaba al de la imagen y el build fallaba.

## Alternativas descartadas

- **Seguir construyendo en el servidor + un timer que haga `git pull`.** Funciona
  sin registry, pero el servidor necesita el repo y el build, y no es el modelo
  de las demas apps del homelab.
- **Push-to-deploy** (repo bare con `post-receive`). Inmediato, pero solo desde
  maquinas con SSH al servidor, y sigue construyendo alla.
- **GitHub Actions.** Se descarto por pedido: no depender de un CI externo.
- **Registry propio en el homelab.** Todo queda en casa, pero Docker exige HTTPS
  para un registry: configurar registries inseguros en la PC y el servidor, o un
  certificado. Mas friccion que GHCR para el mismo resultado.

## Consecuencias

- Instalar: `curl -fsSL .../deploy/install.sh | sh`. Actualizar: Watchtower, o
  `docker compose pull && docker compose up -d`. Volver atras: `MANGO_TAG=<commit>`.
- Publicar: `docker login ghcr.io` una vez, y `make release` en cada version.
  Servidor ARM: `PLATFORMS=linux/arm64`.
- El compose de `infra/` queda para **desarrollo** (y `make deploy`, que construye
  desde el codigo en la misma maquina y reinicia PowerSync para que tome la config).
- Volver atras la imagen no revierte el esquema: por expandir/contraer, el codigo
  viejo sigue funcionando contra el esquema nuevo.
