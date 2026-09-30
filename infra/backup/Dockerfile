# Respaldo diario de la base de Mango: postgres (por el pg_dump de la misma
# version mayor que la base) + el loop de backup.sh adentro. Es una imagen para
# que el servidor no necesite ningun archivo del repo (ver 0020).
FROM postgres:16

LABEL org.opencontainers.image.source="https://github.com/FedeXX5652/mango" \
      org.opencontainers.image.title="mango-backup" \
      org.opencontainers.image.description="Mango: pg_dump diario con retencion"

COPY backup.sh /backup.sh
ENTRYPOINT ["/bin/sh", "/backup.sh"]
