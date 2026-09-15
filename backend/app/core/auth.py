import logging
from typing import Any, Dict, Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
import jwt
from jwt import PyJWKClient, PyJWKClientError, PyJWTError
from pydantic import BaseModel, Field
from app.core.config import settings
from app.services.storage_service import storage_service

logger = logging.getLogger(__name__)

# Bearer security scheme for Swagger UI and header parsing
security = HTTPBearer(auto_error=False)

# Cached JWKS client for public key verification
_jwks_client: Optional[PyJWKClient] = None


def get_jwks_client() -> Optional[PyJWKClient]:
    """Retrieve or initialize the cached PyJWKClient."""
    global _jwks_client
    if _jwks_client is not None:
        return _jwks_client

    jwks_url = settings.supabase_jwks_url
    if jwks_url:
        _jwks_client = PyJWKClient(jwks_url, cache_jwk_set=True, lifespan=3600)
    return _jwks_client


class AuthenticatedUser(BaseModel):
    """Model representing a verified Supabase authenticated user."""

    id: str = Field(description="Unique Supabase user identifier (sub claim)")
    email: Optional[str] = Field(default=None, description="User email address")
    role: Optional[str] = Field(default=None, description="Auth role claim (e.g. authenticated)")
    app_metadata: Dict[str, Any] = Field(default_factory=dict, description="Application metadata")
    user_metadata: Dict[str, Any] = Field(default_factory=dict, description="Custom user metadata")


def _user_from_payload(payload: Dict[str, Any]) -> AuthenticatedUser:
    """Construct an AuthenticatedUser instance from decoded JWT claims."""
    sub = payload.get("sub")
    if not sub:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token missing subject (sub) claim",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return AuthenticatedUser(
        id=str(sub),
        email=payload.get("email"),
        role=payload.get("role"),
        app_metadata=payload.get("app_metadata", {}) or {},
        user_metadata=payload.get("user_metadata", {}) or {},
    )


def verify_supabase_token(token: str) -> AuthenticatedUser:
    """
    Verify a Supabase-issued JWT token.
    
    Verification hierarchy:
    1. Public JWKS endpoint (ES256/RS256) via PyJWKClient (standard for modern Supabase projects).
    2. Shared secret (HS256) via SUPABASE_JWT_SECRET if configured.
    3. Fallback verification via Supabase Auth client (get_user API) to validate active sessions.
    
    Raises:
        HTTPException (401): If token is invalid, expired, or verification fails.
    """
    if not token or not token.strip():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication token is empty",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        unverified_header = jwt.get_unverified_header(token)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Malformed authentication token: {exc}",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    alg = unverified_header.get("alg", "")

    # 1. Verify via JWKS (for ES256 / RS256 with kid)
    jwks_client = get_jwks_client()
    if jwks_client and ("kid" in unverified_header or alg in ("ES256", "RS256")):
        try:
            signing_key = jwks_client.get_signing_key_from_jwt(token)
            payload = jwt.decode(
                token,
                signing_key.key,
                algorithms=["ES256", "RS256", "HS256"],
                options={"verify_aud": False},
            )
            return _user_from_payload(payload)
        except (PyJWKClientError, PyJWTError) as jwks_err:
            logger.debug("JWKS verification failed: %s. Attempting fallback.", jwks_err)

    # 2. Verify via SUPABASE_JWT_SECRET (for HS256)
    if settings.SUPABASE_JWT_SECRET and alg == "HS256":
        try:
            payload = jwt.decode(
                token,
                settings.SUPABASE_JWT_SECRET,
                algorithms=["HS256"],
                options={"verify_aud": False},
            )
            return _user_from_payload(payload)
        except PyJWTError as jwt_err:
            logger.debug("HS256 secret verification failed: %s. Attempting fallback.", jwt_err)

    # 3. Fallback: Verify directly with Supabase Auth API
    try:
        supabase = storage_service.get_client()
        user_response = supabase.auth.get_user(token)
        if user_response and user_response.user:
            u = user_response.user
            return AuthenticatedUser(
                id=str(u.id),
                email=getattr(u, "email", None),
                role=getattr(u, "role", None),
                app_metadata=getattr(u, "app_metadata", {}) or {},
                user_metadata=getattr(u, "user_metadata", {}) or {},
            )
    except Exception as api_err:
        logger.debug("Supabase API get_user verification failed: %s", api_err)

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired authentication token",
        headers={"WWW-Authenticate": "Bearer"},
    )


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> AuthenticatedUser:
    """
    FastAPI dependency that extracts and validates the Bearer token from the
    Authorization header, returning the AuthenticatedUser or raising HTTP 401.
    """
    if not credentials or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return verify_supabase_token(credentials.credentials)


def get_current_user_id(
    user: AuthenticatedUser = Depends(get_current_user),
) -> str:
    """
    FastAPI dependency that extracts and returns the authenticated user's ID.
    """
    return user.id


def get_optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> Optional[AuthenticatedUser]:
    """
    FastAPI dependency that returns the AuthenticatedUser if a valid token is
    provided, or None if no token or an invalid token is passed.
    """
    if not credentials or credentials.scheme.lower() != "bearer":
        return None
    try:
        return verify_supabase_token(credentials.credentials)
    except HTTPException:
        return None
