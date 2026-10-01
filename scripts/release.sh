#!/bin/sh
# Publica una version de Mango: arma las 4 imagenes y las sube a GHCR (ver
# docs/decisiones/0020). Corre en TU maquina; no hay CI ni servicios pagos.
#
#   make release                                  # lo normal
#   make release PLATFORMS=linux/arm64            # servidor ARM (Raspberry Pi)
#   make release PLATFORMS=linux/amd64,linux/arm64
#
# Antes, una sola vez:  docker login ghcr.io -u <usuario>   (token classic con write:packages)
#
# Cada imagen sale con dos tags: el commit (fijo, para volver atras) y `latest`
# (el que sigue el servidor). El servidor la toma solo (Watchtower) o con
# `docker compose pull && docker compose up -d`.
set -eu
cd "$(dirname "$0")/.."

REGISTRY="${REGISTRY:-ghcr.io/fedexx5652}"
PLATFORMS="${PLATFORMS:-linux/amd64}"
POWERSYNC_VERSION="${POWERSYNC_VERSION:-latest}"

# Un release sale de un commit: con cambios sin commitear, la imagen no se
# corresponderia con ningun codigo del repo (y el tag mentiria).
if [ -n "$(git status --porcelain)" ]; then
    echo "✗ Hay cambios sin commitear. Commitealos (o descartalos) antes del release." >&2
    git status --short >&2
    exit 1
fi
TAG="$(git rev-parse --short HEAD)"

# Varias plataformas a la vez necesitan un builder de buildx propio (el de
# Docker Desktop por defecto arma una sola).
case "$PLATFORMS" in
    *,*)
        docker buildx inspect mango >/dev/null 2>&1 || docker buildx create --name mango >/dev/null
        BUILDER="--builder mango"
        ;;
    *)
        BUILDER=""
        ;;
esac

publicar() { # nombre contexto [args extra de build...]
    nombre="$1"
    contexto="$2"
    shift 2
    echo
    echo "→ ${REGISTRY}/${nombre}:${TAG}  (${PLATFORMS})"
    # shellcheck disable=SC2086
    docker buildx build $BUILDER --platform "$PLATFORMS" \
        -t "${REGISTRY}/${nombre}:${TAG}" \
        -t "${REGISTRY}/${nombre}:latest" \
        "$@" --push "$contexto"
}

publicar mango-backend backend
publicar mango-frontend frontend --build-arg "APP_COMMIT=${TAG}"
publicar mango-powersync infra/powersync --build-arg "POWERSYNC_VERSION=${POWERSYNC_VERSION}"
publicar mango-backup infra/backup

echo
echo "✓ Publicada la version ${TAG}."
echo "  El servidor la toma solo (Watchtower) o con: docker compose pull && docker compose up -d"
echo "  Volver a esta version en el servidor: MANGO_TAG=${TAG} en el .env"
