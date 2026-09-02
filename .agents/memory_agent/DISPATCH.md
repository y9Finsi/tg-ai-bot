# Memory Agent Dispatch Directives

## Mission
Maintain 100% accuracy, alignment, and synchronicity of the project memory layers with the codebase.

## Scope & Jurisdiction
1. `AGENTS.md` — Project dispatcher, team roles, architecture summary, and rules.
2. `memory/` directory:
   - `index.md` — Memory index and lazy loading navigation.
   - `architecture.md` — Topology, ports, service interactions, Docker network.
   - `backend.md` — `src/` modules, DB migrations, Radiant engine, AI pipeline, tool calling.
   - `frontend.md` — `admin-v2/` features, React 19 + Tailwind v4 components, layouts, styling.
   - `payments.md` — Platega gateway, subscription lifecycles, tariffs, webhook contracts.
   - `gotchas.md` — Edge cases, race conditions, limits, fallbacks, model reasoning caveats.
   - `domain.md` — Ubiquitous language, entities, state machines.

## Operational Protocol
- Scan git diffs and codebase changes after feature completions or refactorings.
- Verify facts in code before recording into memory.
- Document gotchas and critical architecture changes immediately.
- Prevent knowledge drift across multi-agent handoffs.
