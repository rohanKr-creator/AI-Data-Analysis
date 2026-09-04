from fastapi import APIRouter
from app.api.v1.endpoints import health, datasets

api_router = APIRouter()

# Register API v1 modules
api_router.include_router(health.router, tags=["health"])
api_router.include_router(datasets.router, tags=["datasets"])
