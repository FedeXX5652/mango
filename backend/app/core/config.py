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
    # Ademas, cualquier IP privada de la LAN en los puertos de Vite (para probar
    # desde el celular en la misma red).
    cors_origin_regex: str = (
        r"http://(127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|"
        r"10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}):(5173|4173)"
    )

    # Usuario semilla (fase 1: un solo usuario, sin auth de servidor).
    # Su id es fijo para que owner_id sea estable entre dispositivos y reinicios.
    # El codigo de acceso (PIN) vive en el cliente, no aca (ver fase 3 para auth real).
    seed_user_id: uuid.UUID = uuid.UUID("00000000-0000-0000-0000-000000000001")
    seed_user_email: str = "yo@mango.local"
    seed_user_name: str = "Yo"

    # PowerSync: la API emite JWT HS256 que el servicio valida. El secreto es la
    # misma clave (base64url) que va en el JWK 'oct' de service.yaml.
    powersync_url: str = "http://localhost:8080"
    powersync_jwt_secret: str = ""
    powersync_jwt_audience: str = "powersync"


settings = Settings()
