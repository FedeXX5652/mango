#!/bin/sh
# Arranque de la API en el contenedor. Antes de servir, dos pasos idempotentes
# (correrlos de mas no hace nada), en este orden:
#
#   1. alembic upgrade head  — la base queda en el esquema de esta version. Si
#      ya esta, no hace nada. Es donde el redeploy "migra solo" (ver 0012).
#   2. python -m app.seed     — usuario semilla y categorias por defecto. Busca
#      por id fijo; si ya existe, no duplica.
#
# Si la migracion falla, se corta acá: mejor no arrancar que servir contra una
# base a medio migrar. Compose espera a que postgres este healthy antes de esto,
# asi que la base ya responde.
set -e

echo "→ Migrando base de datos…"
alembic upgrade head

echo "→ Sembrando datos por defecto…"
python -m app.seed

echo "→ Levantando API en ${API_HOST}:${API_PORT}"
exec uvicorn app.main:app --host "${API_HOST}" --port "${API_PORT}"
