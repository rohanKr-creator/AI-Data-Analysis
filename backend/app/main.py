from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.api.v1.router import api_router
from app.api.v1.endpoints.health import router as health_router


def create_application() -> FastAPI:
    """Application factory for FastAPI service."""
    application = FastAPI(
        title=settings.PROJECT_NAME,
        version=settings.VERSION,
        openapi_url=f"{settings.API_V1_STR}/openapi.json",
        docs_url=f"{settings.API_V1_STR}/docs",
        redoc_url=f"{settings.API_V1_STR}/redoc",
    )

    # Configure CORS middleware
    if settings.ALLOWED_ORIGINS:
        application.add_middleware(
            CORSMiddleware,
            allow_origins=settings.ALLOWED_ORIGINS,
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )

    # Mount top-level health check endpoint for orchestrators / load balancers
    application.include_router(health_router, tags=["health"])

    # Mount versioned API routes (/api/v1/...)
    application.include_router(api_router, prefix=settings.API_V1_STR)

    return application


app = create_application()
