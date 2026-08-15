from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


ID_PATTERN = r"^[A-Za-z0-9][A-Za-z0-9._:-]*$"


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class SearchRequest(StrictModel):
    tenant_id: str = Field(min_length=1, max_length=128, pattern=ID_PATTERN)
    query: str = Field(min_length=1, max_length=4_000)
    limit: int = Field(default=10, ge=1, le=100)
    include_superseded: bool = False
    include_retracted: bool = False


class ContextSearchRequest(StrictModel):
    """Compatibility request used by the existing Node client.

    The sidecar's canonical contract calls the isolation key ``tenant_id``.
    Node's low-latency compatibility client calls the same key ``user_id``.
    Normalize it here so the backend never has a second, weaker isolation path.
    """

    user_id: str = Field(min_length=1, max_length=128, pattern=ID_PATTERN)
    query: str = Field(min_length=1, max_length=4_000)
    limit: int = Field(default=10, ge=1, le=100)
    threshold: float = Field(default=0.0, ge=0.0, le=1.0)

    def as_search_payload(self) -> dict[str, Any]:
        return {
            "tenant_id": self.user_id,
            "query": self.query,
            "limit": self.limit,
        }


class ContextUpsertRequest(StrictModel):
    user_id: str = Field(min_length=1, max_length=128, pattern=ID_PATTERN)
    memory_id: str = Field(min_length=1, max_length=128, pattern=ID_PATTERN)
    content: str = Field(min_length=1, max_length=100_000)
    metadata: dict[str, Any] = Field(default_factory=dict)
    provenance: dict[str, Any] = Field(default_factory=dict)

    def as_upsert_payload(self) -> dict[str, Any]:
        return {
            "tenant_id": self.user_id,
            "memory_id": self.memory_id,
            "content": self.content,
            "metadata": self.metadata,
            "provenance": self.provenance,
        }


class ContextMemoryMutationRequest(StrictModel):
    user_id: str = Field(min_length=1, max_length=128, pattern=ID_PATTERN)
    memory_id: str = Field(min_length=1, max_length=128, pattern=ID_PATTERN)
    reason: str | None = Field(default=None, max_length=1_000)

    def as_mutation_payload(self) -> dict[str, Any]:
        return {
            "tenant_id": self.user_id,
            "memory_id": self.memory_id,
            "reason": self.reason,
        }


class UpsertRequest(StrictModel):
    tenant_id: str = Field(min_length=1, max_length=128, pattern=ID_PATTERN)
    memory_id: str = Field(min_length=1, max_length=128, pattern=ID_PATTERN)
    content: str = Field(min_length=1, max_length=100_000)
    metadata: dict[str, Any] = Field(default_factory=dict)
    provenance: dict[str, Any] = Field(default_factory=dict)


class RetractRequest(StrictModel):
    tenant_id: str = Field(min_length=1, max_length=128, pattern=ID_PATTERN)
    memory_id: str = Field(min_length=1, max_length=128, pattern=ID_PATTERN)
    reason: str | None = Field(default=None, max_length=1_000)


class PurgeRequest(StrictModel):
    tenant_id: str = Field(min_length=1, max_length=128, pattern=ID_PATTERN)
    memory_id: str = Field(min_length=1, max_length=128, pattern=ID_PATTERN)
    reason: str | None = Field(default=None, max_length=1_000)


class ContextPurgeUserRequest(StrictModel):
    user_id: str = Field(min_length=1, max_length=128, pattern=ID_PATTERN)
    reason: str | None = Field(default=None, max_length=1_000)

    def as_purge_user_payload(self) -> dict[str, Any]:
        return {
            "tenant_id": self.user_id,
            "reason": self.reason,
        }


class PurgeUserRequest(StrictModel):
    tenant_id: str = Field(min_length=1, max_length=128, pattern=ID_PATTERN)
    reason: str | None = Field(default=None, max_length=1_000)


MemoryStatus = Literal["active", "superseded", "retracted"]


class SidecarProvenance(StrictModel):
    payload_sha256: str
    version: int
    revision_id: str
    recorded_at: str
    request_id: str


class ProvenanceEnvelope(StrictModel):
    caller: dict[str, Any]
    sidecar: SidecarProvenance


class MemoryRecord(StrictModel):
    tenant_id: str
    memory_id: str
    revision_id: str
    version: int
    status: MemoryStatus
    content: str
    metadata: dict[str, Any]
    provenance: ProvenanceEnvelope
    created_at: str
    superseded_at: str | None
    retracted_at: str | None
    retraction_reason: str | None


class SearchHit(StrictModel):
    score: float
    memory: MemoryRecord


class SearchResponse(StrictModel):
    request_id: str
    tenant_id: str
    query: str
    count: int
    items: list[SearchHit]


class MutationResponseBase(StrictModel):
    request_id: str
    original_request_id: str | None
    tenant_id: str
    memory_id: str
    idempotency_replayed: bool


class UpsertResponse(MutationResponseBase):
    result: Literal["created", "updated", "unchanged"]
    memory: MemoryRecord


class RetractResponse(MutationResponseBase):
    result: Literal["retracted", "already_retracted"]
    memory: MemoryRecord


class Tombstone(StrictModel):
    tenant_id: str
    memory_id: str
    purged_at: str
    reason: str | None
    request_id: str
    versions_purged: int


class PurgeResponse(MutationResponseBase):
    result: Literal["purged", "already_purged"]
    tombstone: Tombstone


class UserPurgeTombstone(StrictModel):
    tenant_id: str
    purged_at: str
    reason: str | None
    request_id: str
    memories_purged: int


class PurgeUserResponse(StrictModel):
    request_id: str
    original_request_id: str | None
    tenant_id: str
    idempotency_replayed: bool
    result: Literal["purged", "already_purged"]
    tombstone: UserPurgeTombstone
