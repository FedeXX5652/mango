# Deploy de Mango

Hay dos formas de correr el stack completo:

- **Producción** — tu servidor/homelab baja **imágenes ya publicadas** y las corre.
  No necesita el repo: solo `deploy/docker-compose.yml` y un `.env`. Es la forma
  recomendada. Ver [decisión 0020](../docs/decisiones/0020-deploy-por-imagenes.md).
- **Desarrollo** — este directorio (`infra/`): construye desde el código.

---

## Producción (imágenes publicadas)

### Qué corre

| Contenedor | Imagen | Qué hace | Puerto |
|---|---|---|---|
| `mango-frontend` | `mango-frontend` | PWA + **puerta de entrada**: proxy a `/api` y `/powersync` | **`MANGO_PORT`** (8081) |
| `mango-backend` | `mango-backend` | API FastAPI. **Migra la base al arrancar** | interno |
| `mango-powersync` | `mango-powersync` | Sincronización, con la config de Mango adentro | interno |
| `mango-postgres` | `postgres:16` | Base de la app | interno |
| `mango-powersync-storage` | `postgres:16` | Buckets de sync (cache derivada) | interno |
| `mango-backup` | `mango-backup` | `pg_dump` diario con retención | — |

Se publica **un solo puerto**. Las imágenes de Mango están en
`ghcr.io/fedexx5652/` y son públicas: se bajan sin login.

Volúmenes (con nombre fijo): `mango-pgdata`, `mango-powersync-storage`,
`mango-attachments` (fotos de tickets) y `mango-backups`.

### Instalar

En el servidor, con Docker y el plugin `docker compose`:

```bash
curl -fsSL https://raw.githubusercontent.com/FedeXX5652/mango/master/deploy/install.sh | sh
```

Crea `./mango/` con el `docker-compose.yml` y un `.env` con **secretos generados
al azar**, baja las imágenes y levanta todo. Al final imprime la dirección y la
**clave temporal** del primer usuario (`yo`); la app pide cambiarla al entrar.

Opciones: `MANGO_DIR=/opt/mango` (dónde instalar) y `MANGO_PORT=9000` (puerto).
Volver a correrlo es seguro: **conserva el `.env` y los datos**.

**A mano**, si preferís no usar el script:

```bash
mkdir mango && cd mango
curl -fsSLO https://raw.githubusercontent.com/FedeXX5652/mango/master/deploy/docker-compose.yml
curl -fsSL -o .env https://raw.githubusercontent.com/FedeXX5652/mango/master/deploy/.env.example
# completar los 3 secretos del .env (los comandos para generarlos están ahí)
docker compose up -d
```

Entrar a `http://<servidor>:8081`. Pensado para ir por
[Tailscale](https://tailscale.com/), que cifra punta a punta: no hace falta
exponer nada a internet.

### Actualizar

**Solo, con Watchtower.** Las imágenes de Mango tienen
`com.centurylinklabs.watchtower.enable=true`; las bases, `false` (reiniciar la
base lo decidís vos). Cuando se publica una versión, Watchtower baja las imágenes
nuevas y recrea los contenedores: **el backend migra al arrancar** y PowerSync se
reinicia después (label `watchtower.depends-on`). Si corrés Watchtower con
`--label-enable`, solo toca lo que tiene el label en `true`.

**A mano:**

```bash
docker compose pull && docker compose up -d
```

### Volver a una versión anterior

Cada versión se publica también con el tag de su commit. En el `.env`:

```
MANGO_TAG=79e7cc0
```

y `docker compose up -d`. Para volver a seguir las actualizaciones:
`MANGO_TAG=latest`. Volver atrás la imagen no revierte el esquema, y no hace
falta: los cambios de esquema son aditivos (expandir/contraer, ver 0012).

### Respaldos

`mango-backup` hace `pg_dump` de la base cada 24 h en el volumen `mango-backups`
y borra los de más de `BACKUP_RETENTION_DAYS` días. **Solo la base de la app**:
la de `powersync-storage` es cache y se reconstruye sola.

```bash
# ver los respaldos
docker run --rm -v mango-backups:/b alpine ls -la /b

# restaurar uno (reconstruye la base entera)
docker run --rm -v mango-backups:/b alpine cat /b/mango-AAAA-MM-DD_HHMMSS.sql.gz \
  | gunzip | docker exec -i mango-postgres psql -U mango -d mango
```

Los **adjuntos** viven en el volumen `mango-attachments`; si querés respaldarlos
también, copialo con el método que uses para el resto del homelab.

---

## Publicar una versión (mantenimiento)

Se hace desde la máquina de desarrollo: sin CI ni servicios pagos.

**Una sola vez:**

1. Un token *classic* de GitHub con el permiso `write:packages`
   (Settings → Developer settings → Personal access tokens).
2. `docker login ghcr.io -u <tu-usuario>` y pegar el token como contraseña.
3. Después del primer release: en GitHub → *Packages*, verificar que cada imagen
   quede **Public** (Package settings → Change visibility). Así el servidor las
   baja sin login.

**Cada versión** (con todo commiteado):

```bash
make release                          # o, sin make:  sh scripts/release.sh
make release PLATFORMS=linux/arm64    # servidor ARM (Raspberry Pi)
```

Arma `mango-backend`, `mango-frontend`, `mango-powersync` y `mango-backup` y las
sube con dos tags: el commit y `latest`. Se niega a publicar con cambios sin
commitear: cada imagen corresponde a un commit.

`POWERSYNC_VERSION` fija la versión base de PowerSync (por defecto `latest`, que
queda congelada en la imagen publicada): `make release POWERSYNC_VERSION=<x.y.z>`.

---

## Desarrollo (desde el código)

`infra/docker-compose.yml` construye todo desde el repo.

| Comando | Qué hace |
|---|---|
| `make dev` | Levanta solo la capa de datos (Postgres + PowerSync) para correr la API y la PWA a mano |
| `make deploy` | Construye y levanta **todo** en esta máquina (perfil `app`) — sirve para probar la build de producción |

En `make deploy`, PowerSync lee su config por **bind mount**, y `up -d` no
recrea un contenedor cuando cambia el contenido de un archivo montado: por eso
el target lo reinicia al final. En producción no pasa, porque la config viaja
dentro de la imagen.

El backend en contenedor **no arranca sin `SECRET_KEY`** (la corta el
entrypoint): definila en el `.env` de la raíz (`openssl rand -hex 32`).
