from __future__ import annotations

import hashlib
import json


def _upsert(
    client,
    headers,
    *,
    tenant_id: str = "tenant-a",
    memory_id: str = "memory-1",
    content: str = "Лера любит утренний кофе",
    metadata: dict | None = None,
    provenance: dict | None = None,
):
    return client.post(
        "/v1/memory/upsert",
        headers=headers,
        json={
            "tenant_id": tenant_id,
            "memory_id": memory_id,
            "content": content,
            "metadata": metadata or {},
            "provenance": provenance or {},
        },
    )


def _search(client, *, tenant_id: str, query: str, **flags):
    return client.post(
        "/v1/memory/search",
        json={
            "tenant_id": tenant_id,
            "query": query,
            **flags,
        },
    )


def test_health_exposes_explicit_nondurable_memory_mode(client):
    response = client.get("/health", headers={"X-Request-ID": "health-check"})

    assert response.status_code == 200
    assert response.headers["X-Request-ID"] == "health-check"
    assert response.json() == {
        "request_id": "health-check",
        "status": "ok",
        "service": "lera-semantica-sidecar",
        "version": "0.1.0",
        "backend": {
            "mode": "memory",
            "ready": True,
            "durable": False,
            "semantic": False,
            "implementation": "deterministic-lexical",
            "details": {},
        },
    }


def test_node_context_search_uses_user_id_and_marks_fallback(client):
    created = _upsert(
        client,
        {"Idempotency-Key": "context-upsert"},
        tenant_id="42",
        content="пользователь любит кофе",
    )
    assert created.status_code == 200

    response = client.post(
        "/context/search",
        json={"user_id": "42", "query": "кофе", "limit": 8, "threshold": 0.65},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["user_id"] == "42"
    assert body["results"][0]["text"] == "пользователь любит кофе"
    assert body["backend"]["mode"] == "memory"
    assert body["backend"]["semantic"] is False


def test_node_context_mutation_aliases_keep_tenant_isolation(client):
    first = client.post(
        "/context/upsert",
        headers={"Idempotency-Key": "context-a"},
        json={"user_id": "7", "memory_id": "fact", "content": "secret"},
    )
    second = client.post(
        "/context/upsert",
        headers={"Idempotency-Key": "context-b"},
        json={"user_id": "8", "memory_id": "fact", "content": "other"},
    )
    assert first.status_code == second.status_code == 200

    retract = client.post(
        "/context/retract",
        headers={"Idempotency-Key": "context-retract"},
        json={"user_id": "7", "memory_id": "fact", "reason": "correction"},
    )
    assert retract.status_code == 200

    own_history = _search(
        client,
        tenant_id="7",
        query="secret",
        include_retracted=True,
    )
    other_history = _search(
        client,
        tenant_id="8",
        query="other",
        include_retracted=True,
    )
    assert own_history.json()["items"][0]["memory"]["status"] == "retracted"
    assert other_history.json()["items"][0]["memory"]["status"] == "active"


def test_tenant_isolation_in_reads_writes_and_idempotency(client):
    shared_key = {"Idempotency-Key": "same-key"}
    first = _upsert(
        client,
        shared_key,
        tenant_id="tenant-a",
        content="секрет первого tenant",
    )
    second = _upsert(
        client,
        shared_key,
        tenant_id="tenant-b",
        content="секрет второго tenant",
    )

    assert first.status_code == 200
    assert second.status_code == 200
    tenant_a = _search(client, tenant_id="tenant-a", query="секрет")
    tenant_b = _search(client, tenant_id="tenant-b", query="секрет")

    assert [item["memory"]["content"] for item in tenant_a.json()["items"]] == [
        "секрет первого tenant"
    ]
    assert [item["memory"]["content"] for item in tenant_b.json()["items"]] == [
        "секрет второго tenant"
    ]


def test_idempotency_replay_conflict_and_payload_noop(client):
    payload_headers = {
        "Idempotency-Key": "upsert-idempotency",
        "X-Request-ID": "original-request",
    }
    first = _upsert(client, payload_headers)
    replay = _upsert(
        client,
        {
            "Idempotency-Key": "upsert-idempotency",
            "X-Request-ID": "replay-request",
        },
    )
    conflict = _upsert(
        client,
        {"Idempotency-Key": "upsert-idempotency"},
        content="другой payload",
    )
    unchanged = _upsert(
        client,
        {"Idempotency-Key": "new-key"},
    )

    assert first.status_code == 200
    assert first.json()["result"] == "created"
    assert replay.status_code == 200
    assert replay.json()["request_id"] == "replay-request"
    assert replay.json()["original_request_id"] == "original-request"
    assert replay.json()["idempotency_replayed"] is True
    assert replay.json()["memory"] == first.json()["memory"]

    assert conflict.status_code == 409
    assert conflict.json()["error"]["code"] == "idempotency_conflict"

    assert unchanged.status_code == 200
    assert unchanged.json()["result"] == "unchanged"
    assert unchanged.json()["memory"]["version"] == 1


def test_upsert_versions_and_default_active_filter(client, idempotency_headers):
    first = _upsert(
        client,
        idempotency_headers("v1"),
        content="кофе с овсяным молоком",
    )
    second = _upsert(
        client,
        idempotency_headers("v2"),
        content="кофе без молока",
    )

    assert first.json()["memory"]["version"] == 1
    assert second.json()["result"] == "updated"
    assert second.json()["memory"]["version"] == 2

    active = _search(client, tenant_id="tenant-a", query="кофе")
    history = _search(
        client,
        tenant_id="tenant-a",
        query="кофе",
        include_superseded=True,
    )

    assert [
        (item["memory"]["version"], item["memory"]["status"])
        for item in active.json()["items"]
    ] == [(2, "active")]
    assert [
        (item["memory"]["version"], item["memory"]["status"])
        for item in history.json()["items"]
    ] == [(2, "active"), (1, "superseded")]


def test_provenance_is_enveloped_and_sidecar_fields_cannot_be_overridden(client):
    caller_provenance = {
        "source": "telegram",
        "message_id": 42,
        "sidecar": {"request_id": "caller-cannot-override"},
    }
    payload = {
        "tenant_id": "tenant-a",
        "memory_id": "memory-1",
        "content": "важный факт",
        "metadata": {"topic": "profile"},
        "provenance": caller_provenance,
    }
    response = client.post(
        "/v1/memory/upsert",
        headers={
            "Idempotency-Key": "provenance-key",
            "X-Request-ID": "trusted-request-id",
        },
        json=payload,
    )

    assert response.status_code == 200
    memory = response.json()["memory"]
    sidecar = memory["provenance"]["sidecar"]
    expected_hash = hashlib.sha256(
        json.dumps(
            payload,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        ).encode("utf-8")
    ).hexdigest()

    assert memory["provenance"]["caller"] == caller_provenance
    assert sidecar["request_id"] == "trusted-request-id"
    assert sidecar["version"] == memory["version"]
    assert sidecar["revision_id"] == memory["revision_id"]
    assert sidecar["payload_sha256"] == expected_hash


def test_retract_hides_active_memory_but_keeps_history(client, idempotency_headers):
    _upsert(client, idempotency_headers("upsert"))
    retract = client.post(
        "/v1/memory/retract",
        headers=idempotency_headers("retract"),
        json={
            "tenant_id": "tenant-a",
            "memory_id": "memory-1",
            "reason": "user corrected the fact",
        },
    )

    assert retract.status_code == 200
    assert retract.json()["result"] == "retracted"
    assert retract.json()["memory"]["status"] == "retracted"
    assert (
        retract.json()["memory"]["retraction_reason"] == "user corrected the fact"
    )
    assert _search(
        client,
        tenant_id="tenant-a",
        query="кофе",
    ).json()["items"] == []

    history = _search(
        client,
        tenant_id="tenant-a",
        query="кофе",
        include_retracted=True,
    )
    assert history.json()["items"][0]["memory"]["status"] == "retracted"


def test_purge_removes_all_versions_and_leaves_content_free_tombstone(
    client,
    idempotency_headers,
):
    _upsert(
        client,
        idempotency_headers("v1"),
        content="первая приватная версия",
    )
    _upsert(
        client,
        idempotency_headers("v2"),
        content="вторая приватная версия",
    )
    purge_headers = {
        "Idempotency-Key": "purge-key",
        "X-Request-ID": "purge-request",
    }
    purge = client.post(
        "/v1/memory/purge",
        headers=purge_headers,
        json={
            "tenant_id": "tenant-a",
            "memory_id": "memory-1",
            "reason": "erasure request",
        },
    )

    assert purge.status_code == 200
    assert purge.json()["result"] == "purged"
    tombstone = purge.json()["tombstone"]
    assert tombstone["versions_purged"] == 2
    assert set(tombstone) == {
        "tenant_id",
        "memory_id",
        "purged_at",
        "reason",
        "request_id",
        "versions_purged",
    }
    assert not {"content", "metadata", "provenance"}.intersection(tombstone)

    search = _search(
        client,
        tenant_id="tenant-a",
        query="приватная",
        include_superseded=True,
        include_retracted=True,
    )
    assert search.json()["items"] == []

    replay = client.post(
        "/v1/memory/purge",
        headers={
            "Idempotency-Key": "purge-key",
            "X-Request-ID": "purge-replay",
        },
        json={
            "tenant_id": "tenant-a",
            "memory_id": "memory-1",
            "reason": "erasure request",
        },
    )
    assert replay.status_code == 200
    assert replay.json()["idempotency_replayed"] is True
    assert replay.json()["tombstone"] == tombstone

    resurrection = _upsert(
        client,
        {"Idempotency-Key": "resurrection"},
        content="вернуть удалённое",
    )
    assert resurrection.status_code == 409
    assert resurrection.json()["error"]["code"] == "memory_purged"


def test_purge_user_is_tenant_scoped_and_idempotent(client):
    _upsert(
        client,
        {"Idempotency-Key": "purge-user-a-upsert"},
        tenant_id="tenant-a",
        memory_id="profile",
        content="секрет tenant a",
    )
    _upsert(
        client,
        {"Idempotency-Key": "purge-user-b-upsert"},
        tenant_id="tenant-b",
        memory_id="profile",
        content="секрет tenant b",
    )

    purge = client.post(
        "/v1/memory/purge-user",
        headers={
            "Idempotency-Key": "purge-user",
            "X-Request-ID": "purge-user-request",
        },
        json={"tenant_id": "tenant-a", "reason": "account deletion"},
    )

    assert purge.status_code == 200
    assert purge.json()["result"] == "purged"
    assert purge.json()["tombstone"]["memories_purged"] == 1
    assert _search(
        client,
        tenant_id="tenant-a",
        query="секрет",
        include_superseded=True,
        include_retracted=True,
    ).json()["items"] == []
    assert [
        item["memory"]["content"]
        for item in _search(
            client,
            tenant_id="tenant-b",
            query="секрет",
        ).json()["items"]
    ] == ["секрет tenant b"]

    replay = client.post(
        "/v1/memory/purge-user",
        headers={
            "Idempotency-Key": "purge-user",
            "X-Request-ID": "purge-user-replay",
        },
        json={"tenant_id": "tenant-a", "reason": "account deletion"},
    )
    assert replay.status_code == 200
    assert replay.json()["idempotency_replayed"] is True
    assert replay.json()["tombstone"] == purge.json()["tombstone"]


def test_errors_use_one_json_contract(client):
    missing_header = client.post(
        "/v1/memory/upsert",
        json={
            "tenant_id": "tenant-a",
            "memory_id": "memory-1",
            "content": "fact",
        },
    )
    invalid_tenant = _search(client, tenant_id="../tenant", query="fact")

    assert missing_header.status_code == 422
    assert set(missing_header.json()) == {"request_id", "error"}
    assert missing_header.json()["error"]["code"] == "validation_error"
    assert invalid_tenant.status_code == 422
    assert invalid_tenant.json()["error"]["code"] == "validation_error"
