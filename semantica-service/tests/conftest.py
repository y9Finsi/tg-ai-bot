from __future__ import annotations

import itertools

import pytest
from fastapi.testclient import TestClient

from semantica_service.app import create_app
from semantica_service.backend import InMemoryBackend
from semantica_service.config import Settings


@pytest.fixture
def client() -> TestClient:
    app = create_app(
        Settings(backend_mode="memory"),
        backend=InMemoryBackend(),
    )
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def idempotency_headers():
    sequence = itertools.count(1)

    def build(prefix: str = "test") -> dict[str, str]:
        return {
            "Idempotency-Key": f"{prefix}-{next(sequence)}",
            "X-Request-ID": f"request-{prefix}-{next(sequence)}",
        }

    return build

