import uuid

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Configuracion de la API. Lee del entorno y de un .env en la raiz del repo.

    Los defaults permiten correr pruebas sin .env; en dev/prod se sobreescriben.
    """

    model_config = SettingsConfigDict(
        env_file=("../.env", ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Base de datos
    database_url: str = "postgresql+asyncpg://mango:cambiar@localhost:5432/mango"

    # API
    secret_key: str = "dev-insecure-change-me"
    api_host: str = "127.0.0.1"
    api_port: int = 8000
    # Origenes permitidos para CORS (Vite dev y preview por defecto).
    cors_origins: list[str] = ["http://localhost:5173", "http://localhost:4173"]

    # Usuario semilla (fase 1: un solo usuario, sin auth de servidor).
    # Su id es fijo para que owner_id sea estable entre dispositivos y reinicios.
    # El codigo de acceso (PIN) vive en el cliente, no aca (ver fase 3 para auth real).
    seed_user_id: uuid.UUID = uuid.UUID("00000000-0000-0000-0000-000000000001")
    seed_user_email: str = "yo@mango.local"
    seed_user_name: str = "Yo"


settings = Settings()
