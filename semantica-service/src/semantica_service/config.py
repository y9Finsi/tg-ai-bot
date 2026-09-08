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
    yandex_music_token: str | None = None
    yandex_music_proxy_url: str | None = None

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
        yandex_music_token = os.getenv("YANDEX_MUSIC_TOKEN") or None
        if yandex_music_token:
            yandex_music_token = yandex_music_token.strip()

        yandex_music_proxy_url = (
            os.getenv("YANDEX_MUSIC_PROXY_URL")
            or os.getenv("HTTPS_PROXY")
            or os.getenv("HTTP_PROXY")
            or None
        )
        if yandex_music_proxy_url:
            yandex_music_proxy_url = yandex_music_proxy_url.strip()

        return cls(
            backend_mode=backend_mode,
            state_path=state_path,
            yandex_music_token=yandex_music_token,
            yandex_music_proxy_url=yandex_music_proxy_url,
        )

