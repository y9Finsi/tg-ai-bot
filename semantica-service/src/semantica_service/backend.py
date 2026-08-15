from __future__ import annotations

import copy
import hashlib
import importlib
import importlib.metadata
import json
import logging
import os
import re
import tempfile
import threading
from collections.abc import Callable, Mapping
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .config import Settings
from .errors import BackendUnavailable, ServiceError


logger = logging.getLogger(__name__)

STATE_SCHEMA_VERSION = 1
GRAPH_CAPABILITIES = (
    "add_node",
    "add_edge",
    "query",
    "find_active_nodes",
)
TOKEN_RE = re.compile(r"[^\W_]+", re.UNICODE)
ENTITY_KEYS = ("entities", "entity", "subject", "person", "place", "topic")
RELATION_KEYS = ("relations", "relationships", "edges")


def _empty_state() -> dict[str, Any]:
    return {"schema_version": STATE_SCHEMA_VERSION, "tenants": {}}


def _empty_tenant() -> dict[str, Any]:
    return {"memories": {}, "tombstones": {}, "idempotency": {}}


def _canonical_json(value: Any) -> str:
    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )


def _sha256(value: Any) -> str:
    return hashlib.sha256(_canonical_json(value).encode("utf-8")).hexdigest()


def _timestamp(clock: Callable[[], datetime]) -> str:
    value = clock()
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _tokenize(value: str) -> set[str]:
    return set(TOKEN_RE.findall(value.casefold()))


def _tenant_state(
    state: dict[str, Any],
    tenant_id: str,
    *,
    create: bool,
) -> dict[str, Any] | None:
    tenants = state["tenants"]
    tenant = tenants.get(tenant_id)
    if tenant is None and create:
        tenant = _empty_tenant()
        tenants[tenant_id] = tenant
    return tenant


def _validate_state(state: Any) -> dict[str, Any]:
    if not isinstance(state, dict):
        raise ValueError("state root must be an object")
    if state.get("schema_version") != STATE_SCHEMA_VERSION:
        raise ValueError("unsupported state schema version")
    tenants = state.get("tenants")
    if not isinstance(tenants, dict):
        raise ValueError("state.tenants must be an object")

    for tenant_id, tenant in tenants.items():
        if not isinstance(tenant_id, str) or not isinstance(tenant, dict):
            raise ValueError("invalid tenant entry")
        for field in ("memories", "tombstones", "idempotency"):
            if not isinstance(tenant.get(field), dict):
                raise ValueError(f"tenant.{field} must be an object")
        for memory_id, versions in tenant["memories"].items():
            if not isinstance(memory_id, str) or not isinstance(versions, list):
                raise ValueError("invalid memory history")
            for record in versions:
                if not isinstance(record, dict):
                    raise ValueError("memory revision must be an object")
                if record.get("status") not in {
                    "active",
                    "superseded",
                    "retracted",
                }:
                    raise ValueError("invalid memory revision status")
                if not isinstance(record.get("revision_id"), str):
                    raise ValueError("memory revision_id must be a string")
    return state


class CanonicalBackend:
    mode = "memory"
    durable = False
    semantic = False
    implementation = "deterministic-lexical"

    def __init__(
        self,
        *,
        state: dict[str, Any] | None = None,
        clock: Callable[[], datetime] | None = None,
    ) -> None:
        self._state = _validate_state(copy.deepcopy(state or _empty_state()))
        self._clock = clock or (lambda: datetime.now(timezone.utc))
        self._lock = threading.RLock()
        self._failure_reason: str | None = None

    def health(self) -> dict[str, Any]:
        return {
            "mode": self.mode,
            "ready": self._failure_reason is None,
            "durable": self.durable,
            "semantic": self.semantic,
            "implementation": self.implementation,
            "details": self._health_details(),
        }

    def _health_details(self) -> dict[str, Any]:
        details: dict[str, Any] = {}
        if self._failure_reason is not None:
            details["reason"] = self._failure_reason
        return details

    def _ensure_ready(self) -> None:
        if self._failure_reason is not None:
            raise BackendUnavailable()

    def _commit(
        self,
        next_state: dict[str, Any],
        graph_operations: list[dict[str, Any]],
    ) -> None:
        del graph_operations
        self._state = next_state

    def _idempotency_replay(
        self,
        tenant: dict[str, Any] | None,
        *,
        key: str,
        fingerprint: str,
        request_id: str,
    ) -> dict[str, Any] | None:
        if tenant is None:
            return None
        existing = tenant["idempotency"].get(key)
        if existing is None:
            return None
        if existing.get("fingerprint") != fingerprint:
            raise ServiceError(
                409,
                "idempotency_conflict",
                "Idempotency-Key was already used with a different request",
                {
                    "existing_operation": existing.get("operation"),
                },
            )

        response = copy.deepcopy(existing["response"])
        response["original_request_id"] = response["request_id"]
        response["request_id"] = request_id
        response["idempotency_replayed"] = True
        return response

    @staticmethod
    def _store_idempotency(
        tenant: dict[str, Any],
        *,
        key: str,
        fingerprint: str,
        operation: str,
        memory_id: str,
        response: dict[str, Any],
        created_at: str,
    ) -> None:
        tenant["idempotency"][key] = {
            "fingerprint": fingerprint,
            "operation": operation,
            "memory_id": memory_id,
            "response": copy.deepcopy(response),
            "created_at": created_at,
        }

    @staticmethod
    def _normalize_idempotency_key(value: str) -> str:
        key = value.strip()
        if not key or len(key) > 200:
            raise ServiceError(
                400,
                "invalid_idempotency_key",
                "Idempotency-Key must contain 1 to 200 non-whitespace characters",
            )
        return key

    def search(
        self,
        payload: Mapping[str, Any],
        *,
        request_id: str,
    ) -> dict[str, Any]:
        tenant_id = str(payload["tenant_id"])
        query = str(payload["query"])
        limit = int(payload.get("limit", 10))
        statuses = {"active"}
        if payload.get("include_superseded"):
            statuses.add("superseded")
        if payload.get("include_retracted"):
            statuses.add("retracted")

        with self._lock:
            self._ensure_ready()
            tenant = _tenant_state(self._state, tenant_id, create=False)
            candidates: list[dict[str, Any]] = []
            if tenant is not None:
                for versions in tenant["memories"].values():
                    for record in versions:
                        if record["status"] in statuses:
                            candidates.append(record)

            ranked = self._rank(tenant_id, query, candidates)
            ranked.sort(
                key=lambda item: (
                    -item[0],
                    item[1]["memory_id"],
                    -item[1]["version"],
                    item[1]["revision_id"],
                )
            )
            items = [
                {
                    "score": round(score, 6),
                    "memory": copy.deepcopy(record),
                }
                for score, record in ranked[:limit]
            ]

        return {
            "request_id": request_id,
            "tenant_id": tenant_id,
            "query": query,
            "count": len(items),
            "items": items,
        }

    def _rank(
        self,
        tenant_id: str,
        query: str,
        candidates: list[dict[str, Any]],
    ) -> list[tuple[float, dict[str, Any]]]:
        del tenant_id
        query_tokens = _tokenize(query)
        if not query_tokens:
            return []

        ranked = []
        for record in candidates:
            content_tokens = _tokenize(record["content"])
            overlap = len(query_tokens.intersection(content_tokens))
            if overlap:
                ranked.append((overlap / len(query_tokens), record))
        return ranked

    def upsert(
        self,
        payload: Mapping[str, Any],
        *,
        idempotency_key: str,
        request_id: str,
    ) -> dict[str, Any]:
        key = self._normalize_idempotency_key(idempotency_key)
        request_payload = copy.deepcopy(dict(payload))
        tenant_id = str(request_payload["tenant_id"])
        memory_id = str(request_payload["memory_id"])
        fingerprint = _sha256({"operation": "upsert", "request": request_payload})

        with self._lock:
            self._ensure_ready()
            current_tenant = _tenant_state(self._state, tenant_id, create=False)
            replay = self._idempotency_replay(
                current_tenant,
                key=key,
                fingerprint=fingerprint,
                request_id=request_id,
            )
            if replay is not None:
                return replay

            next_state = copy.deepcopy(self._state)
            tenant = _tenant_state(next_state, tenant_id, create=True)
            assert tenant is not None
            if memory_id in tenant["tombstones"]:
                raise ServiceError(
                    409,
                    "memory_purged",
                    "Purged memory IDs cannot be recreated",
                    {"memory_id": memory_id},
                )

            versions = tenant["memories"].setdefault(memory_id, [])
            payload_hash = _sha256(request_payload)
            active = next(
                (
                    record
                    for record in reversed(versions)
                    if record["status"] == "active"
                ),
                None,
            )
            now = _timestamp(self._clock)
            graph_operations: list[dict[str, Any]] = []

            if (
                active is not None
                and active["provenance"]["sidecar"]["payload_sha256"]
                == payload_hash
            ):
                result = "unchanged"
                memory = copy.deepcopy(active)
            else:
                next_version = max(
                    (int(record["version"]) for record in versions),
                    default=0,
                ) + 1
                for record in versions:
                    if record["status"] == "active":
                        record["status"] = "superseded"
                        record["superseded_at"] = now
                        graph_operations.append(
                            {
                                "action": "retract",
                                "tenant_id": tenant_id,
                                "revision_id": record["revision_id"],
                                "reason": f"superseded by version {next_version}",
                                "at": now,
                            }
                        )

                revision_seed = {
                    "tenant_id": tenant_id,
                    "memory_id": memory_id,
                    "version": next_version,
                    "payload_sha256": payload_hash,
                }
                revision_id = f"rev_{_sha256(revision_seed)[:32]}"
                memory = {
                    "tenant_id": tenant_id,
                    "memory_id": memory_id,
                    "revision_id": revision_id,
                    "version": next_version,
                    "status": "active",
                    "content": str(request_payload["content"]),
                    "metadata": copy.deepcopy(request_payload.get("metadata", {})),
                    "provenance": {
                        "caller": copy.deepcopy(
                            request_payload.get("provenance", {})
                        ),
                        "sidecar": {
                            "payload_sha256": payload_hash,
                            "version": next_version,
                            "revision_id": revision_id,
                            "recorded_at": now,
                            "request_id": request_id,
                        },
                    },
                    "created_at": now,
                    "superseded_at": None,
                    "retracted_at": None,
                    "retraction_reason": None,
                }
                versions.append(memory)
                graph_operations.append(
                    {
                        "action": "add",
                        "tenant_id": tenant_id,
                        "record": copy.deepcopy(memory),
                    }
                )
                result = "created" if next_version == 1 else "updated"

            response = {
                "request_id": request_id,
                "original_request_id": None,
                "tenant_id": tenant_id,
                "memory_id": memory_id,
                "idempotency_replayed": False,
                "result": result,
                "memory": copy.deepcopy(memory),
            }
            self._store_idempotency(
                tenant,
                key=key,
                fingerprint=fingerprint,
                operation="upsert",
                memory_id=memory_id,
                response=response,
                created_at=now,
            )
            self._commit(next_state, graph_operations)
            return response

    def retract(
        self,
        payload: Mapping[str, Any],
        *,
        idempotency_key: str,
        request_id: str,
    ) -> dict[str, Any]:
        key = self._normalize_idempotency_key(idempotency_key)
        request_payload = copy.deepcopy(dict(payload))
        tenant_id = str(request_payload["tenant_id"])
        memory_id = str(request_payload["memory_id"])
        fingerprint = _sha256({"operation": "retract", "request": request_payload})

        with self._lock:
            self._ensure_ready()
            current_tenant = _tenant_state(self._state, tenant_id, create=False)
            replay = self._idempotency_replay(
                current_tenant,
                key=key,
                fingerprint=fingerprint,
                request_id=request_id,
            )
            if replay is not None:
                return replay
            if current_tenant is None:
                raise ServiceError(404, "memory_not_found", "Memory was not found")
            if memory_id in current_tenant["tombstones"]:
                raise ServiceError(410, "memory_purged", "Memory was purged")
            if memory_id not in current_tenant["memories"]:
                raise ServiceError(404, "memory_not_found", "Memory was not found")

            next_state = copy.deepcopy(self._state)
            tenant = _tenant_state(next_state, tenant_id, create=False)
            assert tenant is not None
            versions = tenant["memories"][memory_id]
            active = next(
                (
                    record
                    for record in reversed(versions)
                    if record["status"] == "active"
                ),
                None,
            )
            now = _timestamp(self._clock)
            graph_operations: list[dict[str, Any]] = []

            if active is None:
                latest = versions[-1]
                if latest["status"] != "retracted":
                    raise ServiceError(
                        409,
                        "memory_not_active",
                        "Memory has no active revision to retract",
                    )
                result = "already_retracted"
                memory = copy.deepcopy(latest)
            else:
                active["status"] = "retracted"
                active["retracted_at"] = now
                active["retraction_reason"] = request_payload.get("reason")
                memory = copy.deepcopy(active)
                result = "retracted"
                graph_operations.append(
                    {
                        "action": "retract",
                        "tenant_id": tenant_id,
                        "revision_id": active["revision_id"],
                        "reason": request_payload.get("reason"),
                        "at": now,
                    }
                )

            response = {
                "request_id": request_id,
                "original_request_id": None,
                "tenant_id": tenant_id,
                "memory_id": memory_id,
                "idempotency_replayed": False,
                "result": result,
                "memory": memory,
            }
            self._store_idempotency(
                tenant,
                key=key,
                fingerprint=fingerprint,
                operation="retract",
                memory_id=memory_id,
                response=response,
                created_at=now,
            )
            self._commit(next_state, graph_operations)
            return response

    def purge(
        self,
        payload: Mapping[str, Any],
        *,
        idempotency_key: str,
        request_id: str,
    ) -> dict[str, Any]:
        key = self._normalize_idempotency_key(idempotency_key)
        request_payload = copy.deepcopy(dict(payload))
        tenant_id = str(request_payload["tenant_id"])
        memory_id = str(request_payload["memory_id"])
        fingerprint = _sha256({"operation": "purge", "request": request_payload})

        with self._lock:
            self._ensure_ready()
            current_tenant = _tenant_state(self._state, tenant_id, create=False)
            replay = self._idempotency_replay(
                current_tenant,
                key=key,
                fingerprint=fingerprint,
                request_id=request_id,
            )
            if replay is not None:
                return replay
            if current_tenant is None:
                raise ServiceError(404, "memory_not_found", "Memory was not found")

            next_state = copy.deepcopy(self._state)
            tenant = _tenant_state(next_state, tenant_id, create=False)
            assert tenant is not None
            versions = tenant["memories"].get(memory_id)
            existing_tombstone = tenant["tombstones"].get(memory_id)
            now = _timestamp(self._clock)
            graph_operations: list[dict[str, Any]] = []

            if versions:
                revision_ids = [record["revision_id"] for record in versions]
                del tenant["memories"][memory_id]
                for stored_key, entry in list(tenant["idempotency"].items()):
                    if entry.get("memory_id") == memory_id:
                        del tenant["idempotency"][stored_key]

                tombstone = {
                    "tenant_id": tenant_id,
                    "memory_id": memory_id,
                    "purged_at": now,
                    "reason": request_payload.get("reason"),
                    "request_id": request_id,
                    "versions_purged": len(revision_ids),
                }
                tenant["tombstones"][memory_id] = tombstone
                graph_operations.extend(
                    {
                        "action": "purge",
                        "tenant_id": tenant_id,
                        "revision_id": revision_id,
                        "reason": request_payload.get("reason"),
                        "at": now,
                    }
                    for revision_id in revision_ids
                )
                result = "purged"
            elif existing_tombstone is not None:
                tombstone = copy.deepcopy(existing_tombstone)
                result = "already_purged"
            else:
                raise ServiceError(404, "memory_not_found", "Memory was not found")

            response = {
                "request_id": request_id,
                "original_request_id": None,
                "tenant_id": tenant_id,
                "memory_id": memory_id,
                "idempotency_replayed": False,
                "result": result,
                "tombstone": copy.deepcopy(tombstone),
            }
            self._store_idempotency(
                tenant,
                key=key,
                fingerprint=fingerprint,
                operation="purge",
                memory_id=memory_id,
                response=response,
                created_at=now,
            )
            self._commit(next_state, graph_operations)
            return response

    def purge_user(
        self,
        payload: Mapping[str, Any],
        *,
        idempotency_key: str,
        request_id: str,
    ) -> dict[str, Any]:
        key = self._normalize_idempotency_key(idempotency_key)
        request_payload = copy.deepcopy(dict(payload))
        tenant_id = str(request_payload["tenant_id"])
        fingerprint = _sha256({"operation": "purge-user", "request": request_payload})

        with self._lock:
            self._ensure_ready()
            current_tenant = _tenant_state(self._state, tenant_id, create=False)
            replay = self._idempotency_replay(
                current_tenant,
                key=key,
                fingerprint=fingerprint,
                request_id=request_id,
            )
            if replay is not None:
                return replay

            next_state = copy.deepcopy(self._state)
            tenant = _tenant_state(next_state, tenant_id, create=True)
            assert tenant is not None
            records = [
                record
                for versions in tenant["memories"].values()
                for record in versions
            ]
            now = _timestamp(self._clock)
            memories_purged = len(records)
            graph_operations = [
                {
                    "action": "purge",
                    "tenant_id": tenant_id,
                    "revision_id": record["revision_id"],
                    "reason": request_payload.get("reason") or "tenant purge",
                    "at": now,
                }
                for record in records
            ]

            # Remove all user content and old mutation responses. Keep only the
            # current purge key so retries are safe without retaining content.
            tenant["memories"] = {}
            tenant["tombstones"] = {}
            tenant["idempotency"] = {}

            tombstone = {
                "tenant_id": tenant_id,
                "purged_at": now,
                "reason": request_payload.get("reason"),
                "request_id": request_id,
                "memories_purged": memories_purged,
            }
            response = {
                "request_id": request_id,
                "original_request_id": None,
                "tenant_id": tenant_id,
                "idempotency_replayed": False,
                "result": "purged",
                "tombstone": copy.deepcopy(tombstone),
            }
            tenant["idempotency"][key] = {
                "fingerprint": fingerprint,
                "operation": "purge-user",
                "memory_id": "*",
                "response": copy.deepcopy(response),
                "created_at": now,
            }
            self._commit(next_state, graph_operations)
            return response


class InMemoryBackend(CanonicalBackend):
    """Explicit, non-durable backend used by deterministic autonomous tests."""


class SemanticaBackend(CanonicalBackend):
    mode = "semantica"
    durable = True
    semantic = True
    implementation = "semantica-context-graph"

    def __init__(
        self,
        state_path: Path,
        *,
        graph_factory: Callable[..., Any] | None = None,
        clock: Callable[[], datetime] | None = None,
    ) -> None:
        self._state_path = Path(state_path)
        self._graphs: dict[str, Any] = {}
        self._semantica_version = "unknown"

        factory = graph_factory or self._load_graph_factory()
        probe = self._new_graph(factory)
        self._assert_capabilities(probe)
        if graph_factory is None:
            try:
                self._semantica_version = importlib.metadata.version("semantica")
            except importlib.metadata.PackageNotFoundError:
                pass

        state = self._load_state()
        self._graph_factory = factory
        super().__init__(state=state, clock=clock)
        self._graphs = self._build_graphs(self._state)

    @staticmethod
    def _load_graph_factory() -> Callable[..., Any]:
        module = importlib.import_module("semantica.context")
        factory = getattr(module, "ContextGraph", None)
        if factory is None:
            raise RuntimeError("semantica.context.ContextGraph is unavailable")
        return factory

    @staticmethod
    def _new_graph(factory: Callable[..., Any]) -> Any:
        return factory(
            config={
                "extract_entities": False,
                "extract_relationships": False,
                "advanced_analytics": False,
                "centrality_analysis": False,
                "community_detection": False,
                "node_embeddings": False,
            }
        )

    @staticmethod
    def _assert_capabilities(graph: Any) -> None:
        missing = [
            capability
            for capability in GRAPH_CAPABILITIES
            if not callable(getattr(graph, capability, None))
        ]
        if missing:
            raise RuntimeError(
                "Semantica ContextGraph is missing required capabilities: "
                + ", ".join(missing)
            )

    def _health_details(self) -> dict[str, Any]:
        details = {
            "state_path": str(self._state_path),
            "semantica_version": self._semantica_version,
        }
        if self._failure_reason is not None:
            details["reason"] = self._failure_reason
        return details

    def _load_state(self) -> dict[str, Any]:
        if not self._state_path.exists():
            state = _empty_state()
            self._write_state(state)
            return state
        with self._state_path.open("r", encoding="utf-8") as handle:
            return _validate_state(json.load(handle))

    def _write_state(self, state: dict[str, Any]) -> None:
        parent = self._state_path.parent
        parent.mkdir(parents=True, exist_ok=True)
        descriptor, temporary_name = tempfile.mkstemp(
            prefix=f".{self._state_path.name}.",
            suffix=".tmp",
            dir=parent,
        )
        temporary_path = Path(temporary_name)
        try:
            with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
                json.dump(
                    state,
                    handle,
                    ensure_ascii=False,
                    sort_keys=True,
                    separators=(",", ":"),
                )
                handle.flush()
                os.fsync(handle.fileno())
            os.chmod(temporary_path, 0o600)
            os.replace(temporary_path, self._state_path)
            try:
                directory_descriptor = os.open(parent, os.O_RDONLY)
                try:
                    os.fsync(directory_descriptor)
                finally:
                    os.close(directory_descriptor)
            except OSError:
                logger.debug("Directory fsync is unavailable for %s", parent)
        finally:
            if temporary_path.exists():
                temporary_path.unlink()

    def _build_graphs(self, state: dict[str, Any]) -> dict[str, Any]:
        graphs: dict[str, Any] = {}
        for tenant_id in state["tenants"]:
            graph = self._build_tenant_graph(state, tenant_id)
            if graph is not None:
                graphs[tenant_id] = graph
        return graphs

    def _build_tenant_graph(
        self,
        state: dict[str, Any],
        tenant_id: str,
    ) -> Any | None:
        tenant = _tenant_state(state, tenant_id, create=False)
        if tenant is None:
            return None
        records = [
            record
            for versions in tenant["memories"].values()
            for record in versions
        ]
        if not records or not any(record["status"] == "active" for record in records):
            return None

        graph = self._new_graph(self._graph_factory)
        self._assert_capabilities(graph)
        revision_by_memory: dict[str, str] = {}
        previous_revision_by_revision: dict[str, str] = {}
        for versions in tenant["memories"].values():
            for index, record in enumerate(versions):
                if index > 0:
                    previous_revision_by_revision[record["revision_id"]] = versions[index - 1]["revision_id"]
        for record in records:
            revision_by_memory[record["memory_id"]] = record["revision_id"]

        edges: list[tuple[str, str, str, dict[str, Any]]] = []
        for record in records:
            self._graph_add(
                graph,
                record,
                revision_by_memory=revision_by_memory,
                previous_revision_by_revision=previous_revision_by_revision,
                edges=edges,
            )
        for source_id, target_id, edge_type, properties in edges:
            added = graph.add_edge(
                source_id,
                target_id,
                edge_type=edge_type,
                **properties,
            )
            if added is False:
                raise RuntimeError(
                    f"Semantica rejected edge {source_id}->{target_id} ({edge_type})"
                )
        return graph

    @staticmethod
    def _graph_add(
        graph: Any,
        record: Mapping[str, Any],
        *,
        revision_by_memory: Mapping[str, str],
        previous_revision_by_revision: Mapping[str, str],
        edges: list[tuple[str, str, str, dict[str, Any]]],
    ) -> None:
        metadata = record.get("metadata")
        metadata = metadata if isinstance(metadata, Mapping) else {}
        payload = metadata.get("payload")
        payload = payload if isinstance(payload, Mapping) else {}
        status = str(record.get("status") or "active")
        is_active = status == "active"
        valid_until = (
            record.get("superseded_at")
            if status == "superseded"
            else record.get("retracted_at")
        )
        added = graph.add_node(
            record["revision_id"],
            "memory",
            record["content"],
            tenant_id=record["tenant_id"],
            memory_id=record["memory_id"],
            version=record["version"],
            status=status,
            is_active=is_active,
            valid_from=record.get("created_at"),
            valid_until=valid_until,
        )
        if added is False:
            raise RuntimeError(
                f"Semantica rejected revision {record['revision_id']}"
            )

        revision_id = str(record["revision_id"])
        supersedes_id = (
            payload.get("supersedes_id")
            or metadata.get("supersedes_id")
            or metadata.get("supersedesId")
        )
        target_revision = revision_by_memory.get(str(supersedes_id))
        target_revision = target_revision or previous_revision_by_revision.get(revision_id)
        if target_revision and target_revision != revision_id:
            edges.append(
                (
                    revision_id,
                    target_revision,
                    "SUPERSEDES",
                    {"weight": 1.0, "memory_id": record["memory_id"]},
                )
            )

        source_event_id = (
            record.get("source_event_id")
            or payload.get("source_event_id")
            or metadata.get("source_event_id")
        )
        if source_event_id is not None:
            event_node_id = f"event:{source_event_id}"
            event_added = graph.add_node(
                event_node_id,
                "source_event",
                f"conversation event {source_event_id}",
                tenant_id=record["tenant_id"],
                source_event_id=str(source_event_id),
            )
            if event_added is False and event_node_id not in {record["revision_id"]}:
                # Semantica returns False for an existing node. The projection
                # is rebuilt from scratch, so only duplicate references are
                # expected here and are safe to ignore.
                pass
            edges.append(
                (
                    revision_id,
                    event_node_id,
                    "SOURCE_EVENT",
                    {"weight": 0.8, "source_event_id": str(source_event_id)},
                )
            )

        entity_values: list[Any] = []
        for key in ENTITY_KEYS:
            value = payload.get(key)
            if value is None:
                value = metadata.get(key)
            if isinstance(value, list):
                entity_values.extend(value[:16])
            elif value is not None:
                entity_values.append(value)

        entity_ids: dict[str, str] = {}
        for raw_entity in entity_values:
            if isinstance(raw_entity, Mapping):
                label = (
                    raw_entity.get("name")
                    or raw_entity.get("label")
                    or raw_entity.get("id")
                    or raw_entity.get("value")
                )
            else:
                label = raw_entity
            label = str(label or "").strip()
            if not label:
                continue
            entity_key = label.casefold()
            entity_node_id = entity_ids.get(entity_key)
            if entity_node_id is None:
                entity_node_id = f"entity:{_sha256(entity_key)[:16]}"
                entity_ids[entity_key] = entity_node_id
                entity_added = graph.add_node(
                    entity_node_id,
                    "entity",
                    label,
                    tenant_id=record["tenant_id"],
                    entity_key=entity_key,
                )
                if entity_added is False:
                    # Duplicate entity references are expected in one
                    # projection and do not invalidate the graph.
                    pass
            edges.append(
                (
                    revision_id,
                    entity_node_id,
                    "MENTIONS",
                    {"weight": 0.7, "entity_key": entity_key},
                )
            )

        for relation in (
            payload.get("relations")
            or payload.get("relationships")
            or metadata.get("relations")
            or metadata.get("relationships")
            or []
        ):
            if not isinstance(relation, Mapping):
                continue
            target = relation.get("target") or relation.get("to") or relation.get("entity")
            label = relation.get("label") or relation.get("name") or target
            if target is None:
                continue
            target_label = str(target).strip()
            if not target_label:
                continue
            target_key = target_label.casefold()
            target_node_id = entity_ids.get(target_key)
            if target_node_id is None:
                target_node_id = f"entity:{_sha256(target_key)[:16]}"
                entity_ids[target_key] = target_node_id
                graph.add_node(
                    target_node_id,
                    "entity",
                    target_label,
                    tenant_id=record["tenant_id"],
                    entity_key=target_key,
                )
            edges.append(
                (
                    revision_id,
                    target_node_id,
                    str(label or "RELATED_TO").strip().upper()[:64] or "RELATED_TO",
                    {"weight": 0.6},
                )
            )

    def _commit(
        self,
        next_state: dict[str, Any],
        graph_operations: list[dict[str, Any]],
    ) -> None:
        affected_tenants = {
            str(operation["tenant_id"])
            for operation in graph_operations
            if operation.get("tenant_id") is not None
        }
        projected_graphs: dict[str, Any | None] = {}
        try:
            for tenant_id in affected_tenants:
                projected_graphs[tenant_id] = self._build_tenant_graph(
                    next_state,
                    tenant_id,
                )
        except Exception as exc:
            self._failure_reason = "graph_projection_failed"
            logger.exception(
                "Failed to build Semantica projection from canonical state"
            )
            raise BackendUnavailable(
                "Could not update the Semantica index"
            ) from exc

        try:
            self._write_state(next_state)
        except Exception as exc:
            self._failure_reason = "state_write_failed"
            logger.exception("Failed to persist Semantica sidecar state")
            raise BackendUnavailable("Could not persist memory state") from exc

        self._state = next_state
        for tenant_id, graph in projected_graphs.items():
            if graph is None:
                self._graphs.pop(tenant_id, None)
            else:
                self._graphs[tenant_id] = graph
        self._failure_reason = None

    def _rank(
        self,
        tenant_id: str,
        query: str,
        candidates: list[dict[str, Any]],
    ) -> list[tuple[float, dict[str, Any]]]:
        if not candidates:
            return []
        archived_candidates = [
            record for record in candidates if record["status"] != "active"
        ]
        graph = self._graphs.get(tenant_id)
        if graph is None:
            return super()._rank(tenant_id, query, candidates)

        by_revision = {record["revision_id"]: record for record in candidates}
        try:
            active_ids: set[str] = set()
            for item in graph.find_active_nodes(node_type="memory"):
                if isinstance(item, Mapping):
                    node_id = item.get("id")
                    metadata = item.get("metadata")
                else:
                    node_id = getattr(item, "id", None)
                    metadata = getattr(item, "metadata", None)
                if (
                    isinstance(node_id, str)
                    and isinstance(metadata, Mapping)
                    and (
                        metadata.get("status") == "active"
                        or metadata.get("is_active") is True
                    )
                ):
                    active_ids.add(node_id)
            raw_results = graph.query(query, skip=0, limit=None)
        except Exception as exc:
            self._failure_reason = "graph_query_failed"
            logger.exception("Semantica query failed")
            raise BackendUnavailable("Semantica query failed") from exc

        ranked_by_revision: dict[str, float] = {}
        for item in raw_results:
            if isinstance(item, Mapping):
                node = item.get("node")
                item_score = item.get("score", 0.0)
                item_id = item.get("id") or item.get("node_id")
            else:
                node = getattr(item, "node", None)
                item_score = getattr(item, "score", 0.0)
                item_id = getattr(item, "id", None) or getattr(item, "node_id", None)

            revision_id = None
            if isinstance(node, Mapping):
                revision_id = node.get("id") or node.get("node_id")
            elif node is not None:
                revision_id = getattr(node, "id", None) or getattr(node, "node_id", None)
            revision_id = revision_id or item_id
            if not isinstance(revision_id, str) or revision_id not in by_revision:
                continue
            record = by_revision[revision_id]
            if record["status"] == "active" and revision_id not in active_ids:
                continue
            try:
                score = float(item_score)
            except (TypeError, ValueError):
                continue
            ranked_by_revision[revision_id] = max(
                score,
                ranked_by_revision.get(revision_id, float("-inf")),
            )

        graph_ranked = [
            (score, by_revision[revision_id])
            for revision_id, score in ranked_by_revision.items()
        ]
        graph_ranked_revisions = set(ranked_by_revision)
        archived_fallback = [
            (score, record)
            for score, record in super()._rank(
                tenant_id,
                query,
                archived_candidates,
            )
            if record["revision_id"] not in graph_ranked_revisions
        ]
        return graph_ranked + archived_fallback


class UnavailableBackend:
    mode = "semantica"
    durable = True
    semantic = True
    implementation = "semantica-context-graph"

    def __init__(self, reason: str) -> None:
        self._reason = reason

    def health(self) -> dict[str, Any]:
        return {
            "mode": self.mode,
            "ready": False,
            "durable": self.durable,
            "semantic": self.semantic,
            "implementation": self.implementation,
            "details": {"reason": self._reason},
        }

    @staticmethod
    def _raise() -> None:
        raise BackendUnavailable()

    def search(self, *_args: Any, **_kwargs: Any) -> dict[str, Any]:
        self._raise()

    def upsert(self, *_args: Any, **_kwargs: Any) -> dict[str, Any]:
        self._raise()

    def retract(self, *_args: Any, **_kwargs: Any) -> dict[str, Any]:
        self._raise()

    def purge(self, *_args: Any, **_kwargs: Any) -> dict[str, Any]:
        self._raise()

    def purge_user(self, *_args: Any, **_kwargs: Any) -> dict[str, Any]:
        self._raise()


def create_backend(settings: Settings) -> Any:
    if settings.backend_mode == "memory":
        return InMemoryBackend()
    if settings.backend_mode != "semantica":
        raise ValueError(f"Unsupported backend mode: {settings.backend_mode}")

    try:
        return SemanticaBackend(settings.state_path)
    except Exception:
        logger.exception("Semantica backend initialization failed")
        return UnavailableBackend("semantica_initialization_failed")
