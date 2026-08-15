from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from semantica_service.app import create_app
from semantica_service.backend import SemanticaBackend, UnavailableBackend
from semantica_service.config import Settings


class FakeContextGraph:
    events: list[tuple] = []

    def __init__(self, config=None):
        self.config = config or {}
        self.nodes: dict[str, dict] = {}
        self.edges: list[dict] = []
        self.events.append(("init",))

    def add_node(self, node_id, node_type, content=None, **properties):
        if node_id in self.nodes:
            return False
        self.nodes[node_id] = {
            "id": node_id,
            "type": node_type,
            "content": content or "",
            "metadata": properties,
        }
        self.events.append(("add", node_id))
        return True

    def add_edge(self, source_id, target_id, edge_type="related_to", weight=1.0, **properties):
        self.edges.append({
            "source": source_id,
            "target": target_id,
            "type": edge_type,
            "weight": weight,
            "properties": properties,
        })
        self.events.append(("edge", source_id, target_id, edge_type))
        return True

    def query(self, query, skip=0, limit=None):
        words = query.casefold().split()
        results = []
        for node in self.nodes.values():
            content = node["content"].casefold()
            overlap = sum(word in content for word in words)
            if overlap:
                results.append(
                    {
                        "node": dict(node),
                        "score": overlap / len(words),
                    }
                )
        results.sort(key=lambda item: (-item["score"], item["node"]["id"]))
        stop = None if limit is None else skip + limit
        return results[skip:stop]

    def find_active_nodes(self, node_type=None, at_time=None, skip=0, limit=None):
        del at_time
        nodes = [
            dict(node)
            for node in self.nodes.values()
            if node_type is None or node["type"] == node_type
        ]
        stop = None if limit is None else skip + limit
        return nodes[skip:stop]

def _client_for_backend(backend):
    return TestClient(
        create_app(
            Settings(backend_mode="semantica"),
            backend=backend,
        )
    )


def test_semantica_adapter_rebuilds_active_projection_and_restores_state(
    tmp_path: Path,
):
    FakeContextGraph.events.clear()
    state_path = tmp_path / "state.json"
    backend = SemanticaBackend(
        state_path,
        graph_factory=FakeContextGraph,
    )

    with _client_for_backend(backend) as client:
        first = client.post(
            "/v1/memory/upsert",
            headers={"Idempotency-Key": "v1"},
            json={
                "tenant_id": "tenant-a",
                "memory_id": "memory-1",
                "content": "alpha memory",
            },
        )
        second = client.post(
            "/v1/memory/upsert",
            headers={"Idempotency-Key": "v2"},
            json={
                "tenant_id": "tenant-a",
                "memory_id": "memory-1",
                "content": "beta memory",
            },
        )
        retract = client.post(
            "/v1/memory/retract",
            headers={"Idempotency-Key": "retract"},
            json={
                "tenant_id": "tenant-a",
                "memory_id": "memory-1",
                "reason": "obsolete",
            },
        )

    first_revision = first.json()["memory"]["revision_id"]
    second_revision = second.json()["memory"]["revision_id"]
    assert ("add", first_revision) in FakeContextGraph.events
    assert ("add", second_revision) in FakeContextGraph.events
    assert any(event[0] == "edge" and event[3] == "SUPERSEDES" for event in FakeContextGraph.events)
    assert retract.status_code == 200
    assert set(backend._graphs) == set()

    restored = SemanticaBackend(
        state_path,
        graph_factory=FakeContextGraph,
    )
    with _client_for_backend(restored) as client:
        health = client.get("/health")
        history = client.post(
            "/v1/memory/search",
            json={
                "tenant_id": "tenant-a",
                "query": "memory",
                "include_superseded": True,
                "include_retracted": True,
            },
        )
        purge = client.post(
            "/v1/memory/purge",
            headers={"Idempotency-Key": "purge"},
            json={
                "tenant_id": "tenant-a",
                "memory_id": "memory-1",
                "reason": "erasure",
            },
        )

    assert health.status_code == 200
    assert health.json()["backend"]["durable"] is True
    assert health.json()["backend"]["semantic"] is True
    assert [
        (item["memory"]["version"], item["memory"]["status"])
        for item in history.json()["items"]
    ] == [(2, "retracted"), (1, "superseded")]
    assert purge.status_code == 200
    assert set(restored._graphs) == set()

    persisted_text = state_path.read_text(encoding="utf-8")
    assert "alpha memory" not in persisted_text
    assert "beta memory" not in persisted_text
    assert '"provenance"' not in persisted_text


def test_semantica_projection_keeps_history_edges_but_searches_only_active_nodes(
    tmp_path: Path,
):
    backend = SemanticaBackend(
        tmp_path / "state.json",
        graph_factory=FakeContextGraph,
    )
    backend.upsert(
        {
            "tenant_id": "tenant-a",
            "memory_id": "memory-1",
            "content": "живу в Петербурге",
            "metadata": {"payload": {"entities": ["Петербург"], "source_event_id": "11"}},
        },
        idempotency_key="first",
        request_id="first-request",
    )
    backend.upsert(
        {
            "tenant_id": "tenant-a",
            "memory_id": "memory-1",
            "content": "живу в Москве",
            "metadata": {"payload": {"entities": ["Москва"], "source_event_id": "12"}},
        },
        idempotency_key="second",
        request_id="second-request",
    )

    active = backend.search(
        {"tenant_id": "tenant-a", "query": "Петербург"},
        request_id="active-request",
    )
    history = backend.search(
        {
            "tenant_id": "tenant-a",
            "query": "Петербург",
            "include_superseded": True,
        },
        request_id="history-request",
    )

    assert active["items"] == []
    assert history["items"][0]["memory"]["content"] == "живу в Петербурге"
    assert any(event[0] == "edge" and event[3] == "SOURCE_EVENT" for event in FakeContextGraph.events)
    assert any(event[0] == "edge" and event[3] == "MENTIONS" for event in FakeContextGraph.events)


def test_semantica_adapter_rejects_missing_capabilities(tmp_path: Path):
    class IncompleteGraph:
        def __init__(self, config=None):
            del config

        def add_node(self, *_args, **_kwargs):
            return True

        def query(self, *_args, **_kwargs):
            return []

    with pytest.raises(RuntimeError, match="missing required capabilities"):
        SemanticaBackend(
            tmp_path / "state.json",
            graph_factory=IncompleteGraph,
        )


def test_unavailable_production_backend_is_fail_closed():
    with _client_for_backend(
        UnavailableBackend("semantica_initialization_failed")
    ) as client:
        health = client.get("/health")
        search = client.post(
            "/v1/memory/search",
            json={"tenant_id": "tenant-a", "query": "anything"},
        )

    assert health.status_code == 503
    assert health.json()["status"] == "unavailable"
    assert health.json()["backend"]["mode"] == "semantica"
    assert health.json()["backend"]["ready"] is False
    assert search.status_code == 503
    assert search.json()["error"]["code"] == "backend_unavailable"
