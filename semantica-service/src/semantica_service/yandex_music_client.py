from __future__ import annotations

import logging
import re
from typing import Any

logger = logging.getLogger(__name__)

# Регулярные выражения для разбора ссылок Яндекс Музыки
PLAYLIST_RE = re.compile(r"/users/([^/]+)/playlists/(\d+)", re.IGNORECASE)
ALBUM_TRACK_RE = re.compile(r"/album/(\d+)/track/(\d+)", re.IGNORECASE)
ALBUM_RE = re.compile(r"/album/(\d+)", re.IGNORECASE)
TRACK_RE = re.compile(r"/track/(\d+)", re.IGNORECASE)
ARTIST_RE = re.compile(r"/artist/(\d+)", re.IGNORECASE)
CHART_RE = re.compile(r"/chart", re.IGNORECASE)


class YandexMusicService:
    """Обертка над библиотекой MarshalX/yandex-music-api."""

    def __init__(
        self,
        token: str | None = None,
        proxy_url: str | None = None,
    ) -> None:
        self.token = token
        self.proxy_url = proxy_url
        self._client: Any = None

    def _get_client(self) -> Any:
        if self._client is not None:
            return self._client

        from yandex_music import Client
        from yandex_music.utils.request import Request

        req = None
        if self.proxy_url:
            logger.info("Initializing Yandex Music client with proxy: %s", self.proxy_url.split("@")[-1])
            req = Request(proxy_url=self.proxy_url)

        try:
            client = Client(token=self.token, request=req)
            self._client = client.init()
            return self._client
        except Exception as exc:
            logger.error("Failed to initialize Yandex Music Client: %s", exc)
            raise

    @staticmethod
    def _format_track(track: Any, playlist_title: str | None = None) -> dict[str, Any]:
        """Преобразует объект Track в нормализованный словарь."""
        artists = ", ".join(a.name for a in getattr(track, "artists", []) if getattr(a, "name", None)) or "Неизвестный исполнитель"
        albums = getattr(track, "albums", [])
        album_id = albums[0].id if albums else None
        track_id = str(track.id)

        cover_uri = getattr(track, "cover_uri", None)
        cover_url = f"https://{cover_uri.replace('%%', '400x400')}" if cover_uri else None

        if album_id:
            url = f"https://music.yandex.ru/album/{album_id}/track/{track_id}"
        else:
            url = f"https://music.yandex.ru/track/{track_id}"

        title = getattr(track, "title", "Без названия")
        version = getattr(track, "version", None)
        if version:
            title = f"{title} ({version})"

        return {
            "id": track_id,
            "title": title,
            "artists": artists,
            "album_id": str(album_id) if album_id else None,
            "cover_url": cover_url,
            "url": url,
            "duration_ms": getattr(track, "duration_ms", 0),
            "playlist_title": playlist_title,
        }

    def resolve_url(self, url: str, limit: int = 50) -> dict[str, Any]:
        """Разбирает URL Яндекс Музыки (плейлист, альбом, трек, артист, чарт) и возвращает треки."""
        url_clean = str(url or "").strip()
        if not url_clean:
            return {"ok": False, "error": "EMPTY_URL", "message": "URL не может быть пустым"}

        try:
            client = self._get_client()
        except Exception as exc:
            err_str = str(exc)
            if "451" in err_str:
                return {
                    "ok": False,
                    "error": "GEOBLOCK_451",
                    "message": "Яндекс Музыка вернула 451 (региональное ограничение). Настройте YANDEX_MUSIC_TOKEN или YANDEX_MUSIC_PROXY_URL.",
                }
            return {"ok": False, "error": "CLIENT_INIT_FAILED", "message": f"Ошибка инициализации клиента: {exc}"}

        try:
            # 1. Плейлист: /users/<user>/playlists/<kind>
            playlist_m = PLAYLIST_RE.search(url_clean)
            if playlist_m:
                user_id, kind = playlist_m.group(1), playlist_m.group(2)
                playlist = client.users_playlists(int(kind) if kind.isdigit() else kind, user_id)
                if not playlist:
                    return {"ok": False, "error": "NOT_FOUND", "message": "Плейлист не найден"}

                title = getattr(playlist, "title", "Плейлист Яндекс Музыки")
                tracks_raw = getattr(playlist, "tracks", [])[:limit]
                tracks = []
                for item in tracks_raw:
                    tr = item.fetch_track() if hasattr(item, "fetch_track") else (getattr(item, "track", None) or item)
                    if tr:
                        tracks.append(self._format_track(tr, playlist_title=title))

                return {
                    "ok": True,
                    "type": "playlist",
                    "title": title,
                    "tracks": tracks,
                    "count": len(tracks),
                }

            # 2. Трек из альбома: /album/<album>/track/<track>
            album_track_m = ALBUM_TRACK_RE.search(url_clean)
            if album_track_m:
                _, track_id = album_track_m.group(1), album_track_m.group(2)
                tracks = client.tracks([track_id])
                if tracks:
                    formatted = [self._format_track(tracks[0])]
                    return {
                        "ok": True,
                        "type": "track",
                        "title": formatted[0]["title"],
                        "tracks": formatted,
                        "count": 1,
                    }

            # 3. Одиночный трек: /track/<track>
            track_m = TRACK_RE.search(url_clean)
            if track_m:
                track_id = track_m.group(1)
                tracks = client.tracks([track_id])
                if tracks:
                    formatted = [self._format_track(tracks[0])]
                    return {
                        "ok": True,
                        "type": "track",
                        "title": formatted[0]["title"],
                        "tracks": formatted,
                        "count": 1,
                    }

            # 4. Альбом целиком: /album/<album>
            album_m = ALBUM_RE.search(url_clean)
            if album_m:
                album_id = album_m.group(1)
                album = client.albums_with_tracks(int(album_id) if album_id.isdigit() else album_id)
                if not album:
                    return {"ok": False, "error": "NOT_FOUND", "message": "Альбом не найден"}

                title = getattr(album, "title", "Альбом")
                tracks = []
                for volume in getattr(album, "volumes", []):
                    for tr in volume[:limit]:
                        tracks.append(self._format_track(tr, playlist_title=f"Альбом «{title}»"))

                return {
                    "ok": True,
                    "type": "album",
                    "title": title,
                    "tracks": tracks[:limit],
                    "count": len(tracks[:limit]),
                }

            # 5. Исполнитель: /artist/<artist>
            artist_m = ARTIST_RE.search(url_clean)
            if artist_m:
                artist_id = artist_m.group(1)
                aid = int(artist_id) if artist_id.isdigit() else artist_id
                artist_resp = client.artists(aid)
                tracks_resp = client.artists_tracks(aid)
                artist_obj = getattr(artist_resp, "artist", None) or (artist_resp[0] if isinstance(artist_resp, list) and artist_resp else artist_resp)
                artist_name = getattr(artist_obj, "name", "Исполнитель")
                tracks_raw = getattr(tracks_resp, "tracks", [])[:limit]
                tracks = [self._format_track(tr, playlist_title=f"Треки: {artist_name}") for tr in tracks_raw]

                return {
                    "ok": True,
                    "type": "artist",
                    "title": artist_name,
                    "tracks": tracks,
                    "count": len(tracks),
                }

            # 6. Чарт: /chart
            if CHART_RE.search(url_clean):
                chart = client.chart()
                tracks = []
                title = "Чарт Яндекс Музыки"
                chart_tracks = getattr(getattr(chart, "chart", None), "tracks", [])[:limit]
                for item in chart_tracks:
                    tr = getattr(item, "track", None) or item
                    if tr:
                        tracks.append(self._format_track(tr, playlist_title=title))

                return {
                    "ok": True,
                    "type": "chart",
                    "title": title,
                    "tracks": tracks,
                    "count": len(tracks),
                }

            # Если ничего не подошло, пробуем поиск по тексту URL
            return self.search_tracks(url_clean, limit=limit)

        except Exception as exc:
            err_str = str(exc)
            logger.warning("Error resolving Yandex Music URL '%s': %s", url_clean, exc)
            if "401" in err_str or "unauthorized" in err_str.lower():
                return {
                    "ok": False,
                    "error": "TOKEN_EXPIRED",
                    "message": "Токен Яндекс Музыки истек или недействителен. Требуется обновить YANDEX_MUSIC_TOKEN.",
                }
            if "451" in err_str:
                return {
                    "ok": False,
                    "error": "GEOBLOCK_451",
                    "message": "Яндекс Музыка вернула 451 (региональное ограничение). Настройте YANDEX_MUSIC_TOKEN или YANDEX_MUSIC_PROXY_URL.",
                }
            if "403" in err_str:
                return {
                    "ok": False,
                    "error": "FORBIDDEN_403",
                    "message": "Доступ запрещен (403). Проверьте токен или прокси.",
                }
            if "404" in err_str:
                return {
                    "ok": False,
                    "error": "NOT_FOUND_404",
                    "message": "Ресурс не найден в Яндекс Музыке.",
                }
            return {
                "ok": False,
                "error": "RESOLVE_FAILED",
                "message": f"Ошибка при получении данных: {exc}",
            }

    def search_tracks(self, query: str, limit: int = 20) -> dict[str, Any]:
        """Поиск треков по строковому запросу."""
        q = str(query or "").strip()
        if not q:
            return {"ok": False, "error": "EMPTY_QUERY", "message": "Запрос не может быть пустым"}

        try:
            client = self._get_client()
            search = client.search(q, type_="track")
            tracks_raw = getattr(getattr(search, "tracks", None), "results", [])[:limit]
            tracks = [self._format_track(tr) for tr in tracks_raw]
            return {
                "ok": True,
                "type": "search",
                "query": q,
                "tracks": tracks,
                "count": len(tracks),
            }
        except Exception as exc:
            err_str = str(exc)
            logger.warning("Error searching Yandex Music tracks '%s': %s", q, exc)
            if "451" in err_str:
                return {
                    "ok": False,
                    "error": "GEOBLOCK_451",
                    "message": "Яндекс Музыка вернула 451 (региональное ограничение). Настройте YANDEX_MUSIC_TOKEN или YANDEX_MUSIC_PROXY_URL.",
                }
            return {
                "ok": False,
                "error": "SEARCH_FAILED",
                "message": f"Ошибка поиска: {exc}",
            }
