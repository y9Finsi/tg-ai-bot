from __future__ import annotations

from unittest.mock import MagicMock
import pytest
from fastapi.testclient import TestClient

from semantica_service.app import create_app
from semantica_service.backend import InMemoryBackend
from semantica_service.config import Settings
from semantica_service.yandex_music_client import YandexMusicService


class FakeArtist:
    def __init__(self, name: str):
        self.name = name


class FakeAlbum:
    def __init__(self, album_id: int):
        self.id = album_id


class FakeTrack:
    def __init__(self, track_id: int, title: str, artist_names: list[str], album_id: int = 100):
        self.id = track_id
        self.title = title
        self.version = None
        self.artists = [FakeArtist(n) for n in artist_names]
        self.albums = [FakeAlbum(album_id)]
        self.cover_uri = "avatars.yandex.net/get-music-content/123/%%"
        self.duration_ms = 180000


class FakeTrackItem:
    def __init__(self, track: FakeTrack):
        self.track = track

    def fetch_track(self):
        return self.track


class FakePlaylist:
    def __init__(self, title: str, tracks: list[FakeTrack]):
        self.title = title
        self.tracks = [FakeTrackItem(t) for t in tracks]


def test_yandex_music_status_endpoint(client: TestClient):
    res = client.get("/api/music/yandex/status")
    assert res.status_code == 200
    data = res.json()
    assert data["ok"] is True
    assert "has_token" in data
    assert "has_proxy" in data


def test_yandex_music_resolve_playlist_mock():
    mock_service = MagicMock(spec=YandexMusicService)
    mock_service.resolve_url.return_value = {
        "ok": True,
        "type": "playlist",
        "title": "Местное инди",
        "tracks": [
            {
                "id": "12345",
                "title": "Крыши",
                "artists": "Перемотка",
                "album_id": "999",
                "cover_url": "https://avatars.yandex.net/get-music-content/123/400x400",
                "url": "https://music.yandex.ru/album/999/track/12345",
                "duration_ms": 210000,
                "playlist_title": "Местное инди",
            }
        ],
        "count": 1,
    }

    app = create_app(
        Settings(backend_mode="memory"),
        backend=InMemoryBackend(),
        yandex_music_service=mock_service,
    )

    with TestClient(app) as test_client:
        res = test_client.post(
            "/api/music/yandex/resolve",
            json={"url": "https://music.yandex.ru/users/yamusic-top/playlists/1005", "limit": 10},
        )
        assert res.status_code == 200
        data = res.json()
        assert data["ok"] is True
        assert data["title"] == "Местное инди"
        assert len(data["tracks"]) == 1
        assert data["tracks"][0]["title"] == "Крыши"
        assert data["tracks"][0]["artists"] == "Перемотка"


def test_yandex_music_resolve_geoblock_error():
    mock_service = MagicMock(spec=YandexMusicService)
    mock_service.resolve_url.return_value = {
        "ok": False,
        "error": "GEOBLOCK_451",
        "message": "Яндекс Музыка вернула 451",
    }

    app = create_app(
        Settings(backend_mode="memory"),
        backend=InMemoryBackend(),
        yandex_music_service=mock_service,
    )

    with TestClient(app) as test_client:
        res = test_client.post(
            "/api/music/yandex/resolve",
            json={"url": "https://music.yandex.ru/users/yamusic-top/playlists/1005"},
        )
        assert res.status_code == 200
        data = res.json()
        assert data["ok"] is False
        assert data["error"] == "GEOBLOCK_451"


def test_yandex_music_resolve_token_expired():
    mock_service = MagicMock(spec=YandexMusicService)
    mock_service.resolve_url.return_value = {
        "ok": False,
        "error": "TOKEN_EXPIRED",
        "message": "Токен Яндекс Музыки истек или недействителен.",
    }

    app = create_app(
        Settings(backend_mode="memory"),
        backend=InMemoryBackend(),
        yandex_music_service=mock_service,
    )

    with TestClient(app) as test_client:
        res = test_client.post(
            "/api/music/yandex/resolve",
            json={"url": "https://music.yandex.ru/users/yamusic-top/playlists/1005"},
        )
        assert res.status_code == 200
        data = res.json()
        assert data["ok"] is False
        assert data["error"] == "TOKEN_EXPIRED"


def test_yandex_music_service_unit_formatting():
    service = YandexMusicService()
    fake_track = FakeTrack(777, "Кофе мой друг", ["Сироткин"], album_id=55)
    formatted = service._format_track(fake_track, playlist_title="Инди утро")

    assert formatted["id"] == "777"
    assert formatted["title"] == "Кофе мой друг"
    assert formatted["artists"] == "Сироткин"
    assert formatted["album_id"] == "55"
    assert formatted["url"] == "https://music.yandex.ru/album/55/track/777"
    assert formatted["cover_url"] == "https://avatars.yandex.net/get-music-content/123/400x400"
    assert formatted["playlist_title"] == "Инди утро"

