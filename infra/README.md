# Deploy de Mango

Todo el stack corre en Docker: base, PowerSync, API, PWA y respaldos. Un solo
`docker compose up` levanta y actualiza todo.

## Servicios

| Servicio | Qué es | Puerto |
|---|---|---|
| `postgres` | Base de la app | 5432 |
| `powersync-storage` | Postgres de los buckets de sync (cache derivada) | — |
| `powersync` | Servicio de sincronización | 8080 |
| `backend` | API FastAPI. Migra y siembra al arrancar | 8000 |
| `frontend` | PWA servida con nginx | 8081 |
| `backup` | `pg_dump` diario de `mango`, con retención | — |

Los tres últimos están bajo el profile `app`: `make dev` (sin profile) levanta
solo la capa de datos, para correr API y PWA a mano en desarrollo. El deploy usa
`--profile app` y corre todo en contenedores.

## Primera vez

1. `cp .env.example .env` (en la raíz del repo) y completar. Lo que importa para
   el deploy:
   - `POSTGRES_PASSWORD`, `POWERSYNC_JWT_SECRET` — secretos, generarlos.
   - `PUBLIC_API_URL`, `PUBLIC_POWERSYNC_URL` — **la dirección desde la que
     entrás** (el nombre de Tailscale o la IP del homelab), no `localhost`.
     Ej: `http://mango.tu-tailnet.ts.net:8000`.
   - `CORS_ORIGINS` — el origen de la PWA, en JSON.
     Ej: `["http://mango.tu-tailnet.ts.net:8081"]`.
2. `docker compose --env-file ../.env --profile app up -d --build`
3. Entrar a `http://<host>:8081`.

## Actualizar (redeploy)

```
git pull
docker compose --env-file ../.env --profile app up -d --build
```

- La API **migra sola** al arrancar (`alembic upgrade head`, idempotente) y
  siembra lo que falte. No hay que correr nada a mano.
- Si el cambio toca una tabla sincronizada, PowerSync se reinicia con el
  `up` porque su config cambió (ver decisión 0009/0012).

## Ojo: la URL de la API se hornea en el frontend

El navegador habla con la API desde afuera de Docker, así que `PUBLIC_API_URL`
se compila dentro del bundle de la PWA. **Si cambia el host desde el que entrás,
hay que recompilar el frontend** (`up -d --build frontend`). Es la limitación
clásica de una SPA; ver `frontend/Dockerfile`.

## Respaldos

El servicio `backup` hace `pg_dump` de `mango` cada 24 h en el volumen
`mango-backups`, y borra los de más de `BACKUP_RETENTION_DAYS` días. **Solo
`mango`**: la base de `powersync-storage` es cache y se reconstruye sola.

Ver los respaldos:
```
docker run --rm -v infra_mango-backups:/b alpine ls -la /b
```

Restaurar uno (probado: reconstruye la base entera):
```
docker exec -i mango-postgres sh -c 'gunzip -c' < backup.sql.gz \
  | docker exec -i mango-postgres psql -U mango -d mango
```
O más simple, copiando el `.gz` a mano y:
`gunzip -c mango-....sql.gz | psql -U mango -d mango`.

## Qué NO está todavía

- **Sin autenticación**: la API devuelve el usuario semilla sin validar nada.
  No publicar el puerto 8000 fuera del tailnet hasta fase 3a (ver ESPECIFICACION
  §7). Dentro de Tailscale, el túnel ya cifra.
- **Sin HTTPS**: por Tailscale no hace falta; en LAN pelada las credenciales
  viajarían en claro cuando exista el login.
