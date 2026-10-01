.PHONY: help dev test lint migrate down deploy release

# Publicacion de imagenes (make release). Se pueden pisar en la linea de comando:
#   make release PLATFORMS=linux/arm64
REGISTRY ?= ghcr.io/fedexx5652
PLATFORMS ?= linux/amd64
POWERSYNC_VERSION ?= latest

COMPOSE_DEV = docker compose --env-file .env -f infra/docker-compose.yml

help:
	@echo "make dev      levanta la capa de datos local (Postgres + PowerSync)"
	@echo "make down     baja el stack local"
	@echo "make test     corre las pruebas"
	@echo "make lint     formatea y revisa"
	@echo "make migrate  aplica migraciones"
	@echo "make deploy   construye desde el codigo y levanta todo en esta maquina"
	@echo "make release  arma las imagenes y las publica en GHCR (produccion)"

dev:
	$(COMPOSE_DEV) up -d

down:
	$(COMPOSE_DEV) down

# Deploy desde el codigo (sin registry): util para probar la build de produccion
# en local. PowerSync lee su config al arrancar y por bind mount un `up` no lo
# recrea: se reinicia a mano para que tome cambios de sync-config.yaml.
deploy:
	APP_COMMIT=$$(git rev-parse --short HEAD) $(COMPOSE_DEV) --profile app up -d --build
	$(COMPOSE_DEV) restart powersync

# Produccion: publica las imagenes que baja el servidor (ver 0020).
release:
	REGISTRY="$(REGISTRY)" PLATFORMS="$(PLATFORMS)" POWERSYNC_VERSION="$(POWERSYNC_VERSION)" sh scripts/release.sh

test:
	cd backend && pytest -q
	cd frontend && npm test

lint:
	cd backend && ruff format . && ruff check .
	cd frontend && npm run lint

migrate:
	cd backend && alembic upgrade head
