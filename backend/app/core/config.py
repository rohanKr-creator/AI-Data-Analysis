from pathlib import Path
from typing import List, Union
import json
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings and environment configuration."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    PROJECT_NAME: str = "AI Data Analyst"
    VERSION: str = "0.1.0"
    ENVIRONMENT: str = "development"
    API_V1_STR: str = "/api/v1"

    ALLOWED_ORIGINS: Union[List[str], str] = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
    ]

    # File upload settings
    MAX_UPLOAD_SIZE_BYTES: int = 25 * 1024 * 1024  # 25 MB
    UPLOAD_DIR: str = "data/uploads"

    # PostgreSQL Database settings
    DATABASE_URL: str = (
        "postgresql+psycopg2://postgres:postgres@localhost:5432/ai_data_analyst"
    )
    ASYNC_DATABASE_URL: Union[str, None] = None

    @property
    def upload_path(self) -> Path:
        """Resolve the upload directory relative to project root."""
        # Find project root (directory containing data/ or backend/)
        current = Path(__file__).resolve()
        # Look upward for root directory containing data or .gitignore
        for parent in [current.parent.parent.parent, current.parent.parent.parent.parent]:
            candidate = parent / self.UPLOAD_DIR
            if candidate.parent.exists():
                candidate.mkdir(parents=True, exist_ok=True)
                return candidate
        # Fallback to local path
        p = Path(self.UPLOAD_DIR)
        p.mkdir(parents=True, exist_ok=True)
        return p

    @field_validator("ALLOWED_ORIGINS", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v: Union[str, List[str]]) -> List[str]:
        if isinstance(v, str):
            if v.startswith("[") and v.endswith("]"):
                try:
                    return json.loads(v)
                except Exception:
                    pass
            return [i.strip() for i in v.split(",") if i.strip()]
        elif isinstance(v, list):
            return v
        return []


settings = Settings()
