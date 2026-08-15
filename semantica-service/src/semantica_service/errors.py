from __future__ import annotations

from typing import Any


class ServiceError(Exception):
    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        details: Any = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.details = details


class BackendUnavailable(ServiceError):
    def __init__(self, message: str = "Memory backend is unavailable") -> None:
        super().__init__(503, "backend_unavailable", message)

