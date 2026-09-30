#!/bin/sh
# Instalador de Mango para un servidor con Docker (ver docs/decisiones/0020).
#
#   curl -fsSL https://raw.githubusercontent.com/FedeXX5652/mango/master/deploy/install.sh | sh
#
# Hace, en orden:
#   1. Baja docker-compose.yml a ./mango (o a $MANGO_DIR).
#   2. Si no hay .env, lo crea con secretos generados al azar. Si YA hay uno,
#      no lo toca: regenerar la clave de la base dejaria afuera a los datos.
#   3. Baja las imagenes y levanta todo. La API migra la base sola al arrancar.
#
# Volver a correrlo es seguro: actualiza el compose y las imagenes, y conserva
# el .env y los datos.
set -eu

REPO_RAW="${MANGO_REPO_RAW:-https://raw.githubusercontent.com/FedeXX5652/mango/master/deploy}"
DIR="${MANGO_DIR:-./mango}"
PUERTO="${MANGO_PORT:-8081}"

falla() { echo "✗ $*" >&2; exit 1; }

command -v docker >/dev/null 2>&1 || falla "Falta Docker: https://docs.docker.com/engine/install/"
docker compose version >/dev/null 2>&1 || falla "Falta el plugin 'docker compose' (v2)."
command -v curl >/dev/null 2>&1 || falla "Falta curl."

# Secretos al azar, sin depender de openssl.
hex() { od -An -N"$1" -tx1 /dev/urandom | tr -d ' \n'; }
base64url() { head -c "$1" /dev/urandom | base64 | tr '+/' '-_' | tr -d '=\n'; }

mkdir -p "$DIR"
cd "$DIR"

echo "→ Bajando docker-compose.yml"
curl -fsSL "$REPO_RAW/docker-compose.yml" -o docker-compose.yml

if [ -f .env ]; then
    echo "→ Ya hay un .env: se conserva (secretos y datos intactos)."
else
    echo "→ Creando .env con secretos nuevos"
    CLAVE_INICIAL="$(hex 9)"
    umask 077
    cat > .env <<EOF
# Mango — configuracion del servidor. Generado por install.sh.
# NO compartir: tiene los secretos de la instalacion.

# --- Secretos (obligatorios) ---
# Solo letras y numeros: la de la base va dentro de una URL de conexion.
POSTGRES_PASSWORD=$(hex 24)
# Firma las sesiones de login.
SECRET_KEY=$(hex 32)
# Clave compartida API <-> PowerSync (base64url).
POWERSYNC_JWT_SECRET=$(base64url 32)
POWERSYNC_STORAGE_PASSWORD=$(hex 16)

# --- Primer usuario ---
# Se crea en la primera instalacion. La clave es TEMPORAL: al entrar, la app
# obliga a cambiarla.
SEED_USER_USERNAME=yo
SEED_USER_PASSWORD=$CLAVE_INICIAL

# --- Opcionales ---
# Puerto por el que se entra (el unico que se publica).
MANGO_PORT=$PUERTO
# Version. 'latest' sigue las actualizaciones (Watchtower o compose pull).
# Para fijar una version o volver atras: el tag del commit (ej. 79e7cc0).
MANGO_TAG=latest
# Zona horaria: define en que dia cae un movimiento recurrente.
TZ=America/Argentina/Buenos_Aires
# Dias de respaldos diarios que se guardan.
BACKUP_RETENTION_DAYS=14
EOF
fi

echo "→ Bajando imagenes"
docker compose pull

echo "→ Levantando Mango (la primera vez tarda: migra y siembra la base)"
docker compose up -d

HOST_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
[ -n "$HOST_IP" ] || HOST_IP="$(hostname)"
PUERTO_ENV="$(grep -E '^MANGO_PORT=' .env | cut -d= -f2)"

echo
echo "✓ Mango esta arriba:  http://${HOST_IP}:${PUERTO_ENV:-$PUERTO}"
if [ -n "${CLAVE_INICIAL:-}" ]; then
    echo "  Usuario: yo   Clave temporal: ${CLAVE_INICIAL}   (la app pide cambiarla)"
fi
echo "  Config y secretos en: $(pwd)/.env"
