# API de Mango (FastAPI + uvicorn).
FROM python:3.13-slim AS base

LABEL org.opencontainers.image.source="https://github.com/FedeXX5652/mango" \
      org.opencontainers.image.title="mango-backend" \
      org.opencontainers.image.description="Mango: API (FastAPI). Migra la base al arrancar."

# - PYTHONUNBUFFERED: los logs salen al instante, no en bloques (importa para
#   ver el arranque en el homelab).
# - sin .pyc: la imagen no los necesita y ensucian.
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

# Primero las dependencias, para que cambiar el codigo no reinstale todo. Se
# copia solo el pyproject y se instala sin el codigo con --no-install-project…
# pero sin lockfile ni uv, se instala el paquete entero: se acepta el costo.
COPY pyproject.toml ./
COPY app ./app
COPY alembic ./alembic
COPY alembic.ini ./
COPY docker-entrypoint.sh ./
# Para generar las claves del push con la imagen, sin Python en el servidor
# (0029). Los otros scripts son de desarrollo y no entran.
COPY scripts/generar_vapid.py ./scripts/

# Sin las dev-deps: la imagen de produccion no corre pruebas.
RUN pip install --no-cache-dir . \
    && chmod +x docker-entrypoint.sh

# Bind a todas las interfaces del contenedor; quien expone el puerto es compose.
# Los adjuntos van a /data/attachments, que en compose es un VOLUMEN: si
# quedaran en el filesystem del contenedor se perderian en cada actualizacion.
ENV API_HOST=0.0.0.0 \
    API_PORT=8000 \
    ATTACHMENTS_DIR=/data/attachments
EXPOSE 8000

# El entrypoint migra y siembra (idempotentes) antes de levantar uvicorn.
ENTRYPOINT ["./docker-entrypoint.sh"]
