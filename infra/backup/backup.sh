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
HOST="${POSTGRES_HOST:-postgres}"
DESTINO=/backups

echo "Respaldo de '${BASE}' cada 24h, guardando ${DIAS} dias en ${DESTINO}"

# Reintento corto tras una falla: esperar 24h dejaba un dia entero sin respaldo.
REINTENTO=300

while true; do
    # Al prender el servidor todos los contenedores arrancan juntos (restart:
    # unless-stopped no respeta depends_on): se espera a que la base acepte
    # conexiones en vez de fallar contra un postgres que todavia arranca.
    until pg_isready -q -h "${HOST}" -U "${USUARIO}" -d "${BASE}"; do sleep 5; done

    marca=$(date +%Y-%m-%d_%H%M%S)
    crudo="${DESTINO}/.mango-${marca}.sql"
    archivo="${DESTINO}/mango-${marca}.sql.gz"
    # Primero a un archivo y DESPUES se comprime. Con `pg_dump | gzip`, sh toma
    # el codigo de salida de gzip: si pg_dump fallaba, quedaba un .gz vacio de
    # 20 bytes anotado como "ok" (paso en heimdall el 2026-10-01).
    if pg_dump -h "${HOST}" -U "${USUARIO}" "${BASE}" > "${crudo}" && [ -s "${crudo}" ]         && gzip -c "${crudo}" > "${archivo}"; then
        rm -f "${crudo}"
        echo "$(date -Iseconds)  ok  ${archivo}"
        espera=86400
    else
        echo "$(date -Iseconds)  FALLO el respaldo, reintento en ${REINTENTO}s" >&2
        rm -f "${crudo}" "${archivo}"
        espera=${REINTENTO}
    fi
    # Borra los mas viejos que la retencion.
    find "${DESTINO}" -name 'mango-*.sql.gz' -mtime "+${DIAS}" -delete
    sleep "${espera}"
done
