# Lera Semantica memory sidecar

Autonomous Python/FastAPI service for tenant-isolated memory lifecycle
operations. It does not import or call the Node runtime.

## Backend modes

- `SEMANTICA_BACKEND=semantica` is the production mode and the default. It
  requires Semantica `0.6.0`, keeps one tenant-scoped graph projection with an
  active search surface per
  tenant, and atomically persists canonical state to `SEMANTICA_STATE_PATH`
  (default `/data/semantica-state.json`). Lifecycle state stays canonical in
  the sidecar state: a mutation builds a replacement graph from active
  revisions plus the historical nodes needed for `SUPERSEDES` edges before the
  state file is committed, then swaps the projection. Search accepts only
  active memory nodes; historical nodes are retained in the projection for
  causal inspection and are ranked lexically when explicitly requested.
- `SEMANTICA_BACKEND=memory` is an explicit, deterministic lexical fallback for
  autonomous tests and local contract work. It is non-durable and does not
  silently activate when Semantica fails.

If production mode cannot import or initialize Semantica, the process still
serves `GET /health` with HTTP `503`; all memory operations fail closed with
`backend_unavailable`.

## Run

```bash
python -m pip install -e ".[test]"
SEMANTICA_BACKEND=memory uvicorn semantica_service.main:app --port 8081
```

Production installation:

```bash
python -m pip install ".[semantica]"
SEMANTICA_BACKEND=semantica \
SEMANTICA_STATE_PATH=/data/semantica-state.json \
uvicorn semantica_service.main:app --host 0.0.0.0 --port 8081
```

## HTTP conventions

- JSON request and response bodies.
- Mutations require `Idempotency-Key` (1-200 characters).
- `X-Request-ID` is optional. A valid caller value is echoed; otherwise the
  sidecar generates one. Every response also carries this header.
- Tenant and memory IDs match
  `^[A-Za-z0-9][A-Za-z0-9._:-]*$` and are at most 128 characters.
- Unknown JSON fields are rejected.

The canonical API uses `tenant_id`. Compatibility routes under `/context/*`
accept the existing Node contract's `user_id` and normalize it to the same
tenant key; they do not share state across users.

### `GET /health`

Memory mode returns HTTP `200`:

```json
{
  "request_id": "request-123",
  "status": "ok",
  "service": "lera-semantica-sidecar",
  "version": "0.1.0",
  "backend": {
    "mode": "memory",
    "ready": true,
    "durable": false,
    "semantic": false,
    "implementation": "deterministic-lexical",
    "details": {}
  }
}
```

Unavailable Semantica mode returns the same shape with HTTP `503`,
`status="unavailable"`, `ready=false`, and a safe reason in `backend.details`.

### `POST /v1/memory/search`

Request:

```json
{
  "tenant_id": "telegram:123",
  "query": "любит кофе",
  "limit": 10,
  "include_superseded": false,
  "include_retracted": false
}
```

Response:

```json
{
  "request_id": "request-123",
  "tenant_id": "telegram:123",
  "query": "любит кофе",
  "count": 1,
  "items": [
    {
      "score": 1.0,
      "memory": {
        "tenant_id": "telegram:123",
        "memory_id": "profile.coffee",
        "revision_id": "rev_0123456789abcdef0123456789abcdef",
        "version": 2,
        "status": "active",
        "content": "Пользователь любит кофе",
        "metadata": {"kind": "profile"},
        "provenance": {
          "caller": {"source": "telegram", "message_id": 42},
          "sidecar": {
            "payload_sha256": "64-lowercase-hex-characters",
            "version": 2,
            "revision_id": "rev_0123456789abcdef0123456789abcdef",
            "recorded_at": "2026-08-15T12:00:00Z",
            "request_id": "request-123"
          }
        },
        "created_at": "2026-08-15T12:00:00Z",
        "superseded_at": null,
        "retracted_at": null,
        "retraction_reason": null
      }
    }
  ]
}
```

Default search returns only `active`. `include_superseded` and
`include_retracted` independently add those statuses. Active revisions use
Semantica ranking. Historical revisions use deterministic lexical ranking
from canonical state because Semantica `0.6.0` does not expose retraction or
tombstone lifecycle methods.

### `POST /v1/memory/upsert`

Required header: `Idempotency-Key`.

Request:

```json
{
  "tenant_id": "telegram:123",
  "memory_id": "profile.coffee",
  "content": "Пользователь любит кофе",
  "metadata": {"kind": "profile"},
  "provenance": {"source": "telegram", "message_id": 42}
}
```

Response uses the memory object shown above:

```json
{
  "request_id": "request-123",
  "original_request_id": null,
  "tenant_id": "telegram:123",
  "memory_id": "profile.coffee",
  "idempotency_replayed": false,
  "result": "created",
  "memory": {}
}
```

`result` is `created`, `updated`, or `unchanged`. A changed payload creates the
next version and marks the former active version `superseded`. An identical
payload does not create a version. An idempotency replay sets
`idempotency_replayed=true`, sets `original_request_id`, and preserves the
original memory/provenance.

### `POST /v1/memory/retract`

Required header: `Idempotency-Key`.

Request:

```json
{
  "tenant_id": "telegram:123",
  "memory_id": "profile.coffee",
  "reason": "user correction"
}
```

Response:

```json
{
  "request_id": "request-124",
  "original_request_id": null,
  "tenant_id": "telegram:123",
  "memory_id": "profile.coffee",
  "idempotency_replayed": false,
  "result": "retracted",
  "memory": {}
}
```

`result` is `retracted` or `already_retracted`. Retraction keeps content in
history but excludes it from default search.

### `POST /v1/memory/purge`

Required header: `Idempotency-Key`.

Request:

```json
{
  "tenant_id": "telegram:123",
  "memory_id": "profile.coffee",
  "reason": "erasure request"
}
```

Response:

```json
{
  "request_id": "request-125",
  "original_request_id": null,
  "tenant_id": "telegram:123",
  "memory_id": "profile.coffee",
  "idempotency_replayed": false,
  "result": "purged",
  "tombstone": {
    "tenant_id": "telegram:123",
    "memory_id": "profile.coffee",
    "purged_at": "2026-08-15T12:00:00Z",
    "reason": "erasure request",
    "request_id": "request-125",
    "versions_purged": 2
  }
}
```

`result` is `purged` or `already_purged`. All revisions and idempotency
responses that could retain their content are removed. The tombstone contains
no content, metadata, or provenance. A purged `memory_id` cannot be recreated.

## Error contract

All endpoint errors use:

```json
{
  "request_id": "request-126",
  "error": {
    "code": "idempotency_conflict",
    "message": "Idempotency-Key was already used with a different request",
    "details": {
      "existing_operation": "upsert"
    }
  }
}
```

Known codes include `validation_error`, `invalid_idempotency_key`,
`idempotency_conflict`, `memory_not_found`, `memory_not_active`,
`memory_purged`, `backend_unavailable`, `http_error`, and `internal_error`.

## Node compatibility routes

`POST /context/search` accepts `{user_id, query, limit, threshold}` and returns
`results[{id, fact_id, text, score}]`, matching the current low-latency Node
client. `/context/upsert`, `/context/retract`, `/context/supersede`, and
`/context/purge` expose the same lifecycle with `user_id`; mutations still
require `Idempotency-Key`. Supersede is represented by a new revision of the
same `memory_id`, which is the lifecycle supported by both layers.

The `semantica` backend uses the real `semantica.context.ContextGraph` API:
`add_node`, `add_edge`, `query`, and `find_active_nodes`. Semantica `0.6.0`
does not provide the lifecycle methods `retract_node` or `purge_node` used by
the first prototype, so the sidecar treats the JSON state as canonical and
rebuilds each tenant projection after a mutation. The projection contains
memory nodes plus `SUPERSEDES`, `SOURCE_EVENT`, `MENTIONS`, and declared
relationship edges. The `memory` backend is intentionally only a deterministic
lexical compatibility fallback (`semantic=false`, `durable=false`); it never
activates when the real backend fails.
