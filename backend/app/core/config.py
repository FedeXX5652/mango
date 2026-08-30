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


settings = Settings()
