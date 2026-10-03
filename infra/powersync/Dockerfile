# PowerSync de Mango = la imagen oficial + NUESTRA config adentro (ver 0020).
#
# Con la config dentro de la imagen, cambiar la config es publicar una imagen
# nueva: Watchtower (o un `docker compose pull && up -d`) recrea el contenedor y
# PowerSync la lee al arrancar. Antes iba por un bind mount y un cambio de
# contenido NO recreaba el contenedor: PowerSync seguia con la config vieja (y
# las filas de una tabla nueva se descartaban en el checkpoint, ver 0017).
#
# Sin secretos: service.yaml toma todo lo sensible por `!env` (URIs de las
# bases, clave de los JWT), que llega desde el compose. La imagen es publica.
#
# POWERSYNC_VERSION: la version base de PowerSync, FIJA (la misma que el
# compose y scripts/release.sh; se actualizan juntas). Con `latest` cada release
# podia traer una version distinta.
ARG POWERSYNC_VERSION=1.26.1
FROM journeyapps/powersync-service:${POWERSYNC_VERSION}

LABEL org.opencontainers.image.source="https://github.com/FedeXX5652/mango" \
      org.opencontainers.image.title="mango-powersync" \
      org.opencontainers.image.description="Mango: PowerSync con la configuracion de sync de Mango"

COPY service.yaml sync-config.yaml /config/
ENV POWERSYNC_CONFIG_PATH=/config/service.yaml
CMD ["start", "-r", "unified"]
