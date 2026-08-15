from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Settings:
    """Runtime settings.

    The default is deliberately the production backend. Tests must explicitly
    opt into the non-durable memory backend.
    """

    backend_mode: str = "semantica"
    state_path: Path = Path("/data/semantica-state.json")

    @classmethod
    def from_env(cls) -> "Settings":
        backend_mode = os.getenv("SEMANTICA_BACKEND", "semantica").strip().lower()
        if backend_mode not in {"semantica", "memory"}:
            raise ValueError(
                "SEMANTICA_BACKEND must be either 'semantica' or 'memory'"
            )

        state_path = Path(
            os.getenv("SEMANTICA_STATE_PATH", "/data/semantica-state.json")
        )
        return cls(backend_mode=backend_mode, state_path=state_path)

