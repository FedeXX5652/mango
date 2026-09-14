.PHONY: help dev test lint migrate down

help:
	@echo "make dev      levanta el stack local"
	@echo "make down     baja el stack"
	@echo "make test     corre las pruebas"
	@echo "make lint     formatea y revisa"
	@echo "make migrate  aplica migraciones"

dev:
	docker compose --env-file .env -f infra/docker-compose.yml up -d

down:
	docker compose --env-file .env -f infra/docker-compose.yml down

test:
	cd backend && pytest -q
	cd frontend && npm test

lint:
	cd backend && ruff format . && ruff check .
	cd frontend && npm run lint

migrate:
	cd backend && alembic upgrade head
