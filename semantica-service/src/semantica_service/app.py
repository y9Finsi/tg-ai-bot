from __future__ import annotations

import logging
import re
import uuid
from typing import Annotated, Any

from fastapi import FastAPI, Header, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from . import __version__
from .backend import create_backend
from .config import Settings
from .errors import ServiceError
from .models import (
    ContextMemoryMutationRequest,
    ContextPurgeUserRequest,
    ContextSearchRequest,
    ContextUpsertRequest,
    PurgeRequest,
    PurgeUserRequest,
    PurgeResponse,
    PurgeUserResponse,
    RetractRequest,
    RetractResponse,
    SearchRequest,
    SearchResponse,
    UpsertRequest,
    UpsertResponse,
)


logger = logging.getLogger(__name__)
REQUEST_ID_PATTERN = re.compile(r"^[A-Za-z0-9._:-]{1,128}$")
IdempotencyKey = Annotated[
    str,
    Header(alias="Idempotency-Key", min_length=1, max_length=200),
]


def _request_id(request: Request) -> str:
    return getattr(request.state, "request_id", str(uuid.uuid4()))


def _error_response(
    request: Request,
    *,
    status_code: int,
    code: str,
    message: str,
    details: Any = None,
) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={
            "request_id": _request_id(request),
            "error": {
                "code": code,
                "message": message,
                "details": details,
            },
        },
    )


def create_app(
    settings: Settings | None = None,
    *,
    backend: Any | None = None,
) -> FastAPI:
    resolved_settings = settings or Settings.from_env()
    resolved_backend = backend or create_backend(resolved_settings)

    app = FastAPI(
        title="Lera Semantica Memory Sidecar",
        version=__version__,
    )
    app.state.memory_backend = resolved_backend

    @app.middleware("http")
    async def attach_request_id(request: Request, call_next: Any) -> Any:
        supplied = request.headers.get("X-Request-ID", "")
        request.state.request_id = (
            supplied if REQUEST_ID_PATTERN.fullmatch(supplied) else str(uuid.uuid4())
        )
        response = await call_next(request)
        response.headers["X-Request-ID"] = request.state.request_id
        return response

    @app.exception_handler(ServiceError)
    async def handle_service_error(
        request: Request,
        exc: ServiceError,
    ) -> JSONResponse:
        return _error_response(
            request,
            status_code=exc.status_code,
            code=exc.code,
            message=exc.message,
            details=exc.details,
        )

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(
        request: Request,
        exc: RequestValidationError,
    ) -> JSONResponse:
        details = [
            {
                "location": list(error.get("loc", ())),
                "message": error.get("msg"),
                "type": error.get("type"),
            }
            for error in exc.errors()
        ]
        return _error_response(
            request,
            status_code=422,
            code="validation_error",
            message="Request validation failed",
            details=details,
        )

    @app.exception_handler(StarletteHTTPException)
    async def handle_http_error(
        request: Request,
        exc: StarletteHTTPException,
    ) -> JSONResponse:
        return _error_response(
            request,
            status_code=exc.status_code,
            code="http_error",
            message=str(exc.detail),
        )

    @app.exception_handler(Exception)
    async def handle_unexpected_error(
        request: Request,
        exc: Exception,
    ) -> JSONResponse:
        logger.exception("Unhandled sidecar error", exc_info=exc)
        return _error_response(
            request,
            status_code=500,
            code="internal_error",
            message="Internal server error",
        )

    @app.get("/health")
    def health(request: Request) -> JSONResponse:
        backend_health = resolved_backend.health()
        ready = bool(backend_health["ready"])
        return JSONResponse(
            status_code=200 if ready else 503,
            content={
                "request_id": _request_id(request),
                "status": "ok" if ready else "unavailable",
                "service": "lera-semantica-sidecar",
                "version": __version__,
                "backend": backend_health,
            },
        )

    @app.post("/v1/memory/search", response_model=SearchResponse)
    def search(request: Request, payload: SearchRequest) -> dict[str, Any]:
        return resolved_backend.search(
            payload.model_dump(mode="json"),
            request_id=_request_id(request),
        )

    @app.post("/v1/memory/upsert", response_model=UpsertResponse)
    def upsert(
        request: Request,
        payload: UpsertRequest,
        idempotency_key: IdempotencyKey,
    ) -> dict[str, Any]:
        return resolved_backend.upsert(
            payload.model_dump(mode="json"),
            idempotency_key=idempotency_key,
            request_id=_request_id(request),
        )

    @app.post("/v1/memory/retract", response_model=RetractResponse)
    def retract(
        request: Request,
        payload: RetractRequest,
        idempotency_key: IdempotencyKey,
    ) -> dict[str, Any]:
        return resolved_backend.retract(
            payload.model_dump(mode="json"),
            idempotency_key=idempotency_key,
            request_id=_request_id(request),
        )

    @app.post("/v1/memory/purge", response_model=PurgeResponse)
    def purge(
        request: Request,
        payload: PurgeRequest,
        idempotency_key: IdempotencyKey,
    ) -> dict[str, Any]:
        return resolved_backend.purge(
            payload.model_dump(mode="json"),
            idempotency_key=idempotency_key,
            request_id=_request_id(request),
        )

    @app.post("/v1/memory/purge-user", response_model=PurgeUserResponse)
    def purge_user(
        request: Request,
        payload: PurgeUserRequest,
        idempotency_key: IdempotencyKey,
    ) -> dict[str, Any]:
        return resolved_backend.purge_user(
            payload.model_dump(mode="json"),
            idempotency_key=idempotency_key,
            request_id=_request_id(request),
        )

    @app.post("/context/search")
    def compatibility_search(
        request: Request,
        payload: ContextSearchRequest,
    ) -> dict[str, Any]:
        """Low-latency compatibility surface for the existing Node client.

        ``user_id`` is normalized to the same tenant key used by the canonical
        API.  The response deliberately uses the Node client's result shape;
        it still exposes the selected backend so a memory fallback cannot look
        like semantic retrieval.
        """

        result = resolved_backend.search(
            payload.as_search_payload(),
            request_id=_request_id(request),
        )
        results = [
            {
                "id": item["memory"]["memory_id"],
                "fact_id": item["memory"]["revision_id"],
                "text": item["memory"]["content"],
                "score": item["score"],
                "memory": item["memory"],
            }
            for item in result["items"]
            if item["score"] >= payload.threshold
        ]
        return {
            "request_id": result["request_id"],
            "user_id": payload.user_id,
            "results": results,
            "count": len(results),
            "backend": resolved_backend.health(),
        }

    @app.post("/context/upsert", response_model=UpsertResponse)
    def compatibility_upsert(
        request: Request,
        payload: ContextUpsertRequest,
        idempotency_key: IdempotencyKey,
    ) -> dict[str, Any]:
        return resolved_backend.upsert(
            payload.as_upsert_payload(),
            idempotency_key=idempotency_key,
            request_id=_request_id(request),
        )

    @app.post("/context/retract", response_model=RetractResponse)
    def compatibility_retract(
        request: Request,
        payload: ContextMemoryMutationRequest,
        idempotency_key: IdempotencyKey,
    ) -> dict[str, Any]:
        return resolved_backend.retract(
            payload.as_mutation_payload(),
            idempotency_key=idempotency_key,
            request_id=_request_id(request),
        )

    @app.post("/context/supersede", response_model=UpsertResponse)
    def compatibility_supersede(
        request: Request,
        payload: ContextUpsertRequest,
        idempotency_key: IdempotencyKey,
    ) -> dict[str, Any]:
        # Semantica has no separate supersede primitive: a new revision of the
        # same memory is the honest lifecycle operation and is recorded as such
        # by the canonical backend.
        return resolved_backend.upsert(
            payload.as_upsert_payload(),
            idempotency_key=idempotency_key,
            request_id=_request_id(request),
        )

    @app.post("/context/purge", response_model=PurgeResponse)
    def compatibility_purge(
        request: Request,
        payload: ContextMemoryMutationRequest,
        idempotency_key: IdempotencyKey,
    ) -> dict[str, Any]:
        return resolved_backend.purge(
            payload.as_mutation_payload(),
            idempotency_key=idempotency_key,
            request_id=_request_id(request),
        )

    @app.post("/context/purge-user", response_model=PurgeUserResponse)
    def compatibility_purge_user(
        request: Request,
        payload: ContextPurgeUserRequest,
        idempotency_key: IdempotencyKey,
    ) -> dict[str, Any]:
        return resolved_backend.purge_user(
            payload.as_purge_user_payload(),
            idempotency_key=idempotency_key,
            request_id=_request_id(request),
        )

    return app
