#!/bin/sh
# Respaldo periodico de la base de la app. Corre en un contenedor propio, en un
# loop simple: no hay cron porque el homelab no siempre esta prendido y un cron
# se saltearia dias; un loop con sleep retoma solo al arrancar.
#
# Respalda SOLO `mango`. La base de powersync-storage es cache derivada —los
# buckets se reconstruyen desde `mango`— asi que respaldarla seria guardar algo
# que se regenera. Ver 0011/0012.
#
# Restaurar: gunzip < mango-YYYY... .sql.gz | psql -U mango -d mango
set -e

USUARIO="${POSTGRES_USER:-mango}"
BASE="${POSTGRES_DB:-mango}"
DIAS="${RETENTION_DAYS:-14}"
DESTINO=/backups

echo "Respaldo de '${BASE}' cada 24h, guardando ${DIAS} dias en ${DESTINO}"

while true; do
    marca=$(date +%Y-%m-%d_%H%M%S)
    archivo="${DESTINO}/mango-${marca}.sql.gz"
    if pg_dump -h postgres -U "${USUARIO}" "${BASE}" | gzip > "${archivo}"; then
        echo "$(date -Iseconds)  ok  ${archivo}"
    else
        echo "$(date -Iseconds)  FALLO el respaldo" >&2
        rm -f "${archivo}"
    fi
    # Borra los mas viejos que la retencion.
    find "${DESTINO}" -name 'mango-*.sql.gz' -mtime "+${DIAS}" -delete
    sleep 86400
done
