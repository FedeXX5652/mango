# API de Mango (FastAPI + uvicorn).
FROM python:3.13-slim AS base

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

# Sin las dev-deps: la imagen de produccion no corre pruebas.
RUN pip install --no-cache-dir . \
    && chmod +x docker-entrypoint.sh

# Bind a todas las interfaces del contenedor; quien expone el puerto es compose.
ENV API_HOST=0.0.0.0 \
    API_PORT=8000
EXPOSE 8000

# El entrypoint migra y siembra (idempotentes) antes de levantar uvicorn.
ENTRYPOINT ["./docker-entrypoint.sh"]
