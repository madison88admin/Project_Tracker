# Madison Dev Tracker — Spec (v1.8)

## Model
- **System → Project → Sub-project → Ticket.** Percentages are always computed from tickets, never stored.
- Sub-projects carry start/end dates; their stage derives from tickets (empty = Pipeline, all done = Completed, else In Development). Click a project title = detail modal with subs, stages, dates, and linked tickets.
- **Stages:** `Pipeline → In Development → Completed` (only these three; legacy values auto-migrate).
- **Team:** John Carlo Manalo, Mhark Anthony Pentinio, Stephanie Joyce Guce, Lester Jay Mendoza (+ legacy names on old tickets).
- **Auto-rules:** ticket → Completed sets progress 100 · Prod deploy sets ticket Completed · `hq-sync` tickets are HQ mirrors.

## API contract
| Method | Route | Notes |
|---|---|---|
| GET | /api/health, /api/meta, /api/stats, /api/activity | open |
| GET/POST | /api/systems, /api/projects, /api/subprojects | POST needs name (+systemId / +projectId) |
| PATCH/DELETE | /api/systems/:id, /api/projects/:id, /api/subprojects/:id, /api/tasks/:id | delete unlinks children, never cascades tickets |
| GET/POST/PATCH/DELETE | /api/tasks, /api/tasks/:id | POST needs title + systemId; status auto-maps to 3 stages |
| POST | /api/tasks/:id/updates, /api/tasks/:id/deployments | appended with timestamp + author |
| POST | /api/sync/hq | pull HQ Supabase → upsert projects + update mirror tickets; idempotent |
| POST | /api/sync/push[?dry=1] | push NEW local projects (no hqId) up to HQ; HQ-owned never overwritten |
| GET | /api/sync/status | last pull/push from activity log |
| GET | /api/export | full DB dump |

Errors: `{error}` + 400 validation / 404 unknown id / 502 HQ unreachable.

## Sync contracts
- **Pull** (`Sync HQ`): HQ is source of truth for HQ-owned projects. Matches by `hqId`, else by name under SYS-HQ. New HQ project → creates project + tracking ticket (assignee from HQ owner/team, status from HQ progress).
- **Push** (`Push HQ`): tracker is source of truth for local-only projects. Sends description, developer (initials), progress, Live URL. Linked projects get `hqId` back. `?dry=1` previews with zero writes.
- Both log to Activity; both verified idempotent (re-run = 0 created).

## UX flows (projects-first, no ticket browsing)
Dashboard (project stages, overdue) → Projects (detail modal: subs, stages, dates, sub-task editor) → Systems → Activity → Benchmark. Topbar: + New project, Sync HQ, Push HQ. Sub-task editor modal, avatars, due badges, motion-safe animations. Tickets exist only as sub-project children in the DB + sync engine.

## Verify
`node smoke-test.js` (server running) — CRUD round-trip, validation, 404s, sync dry-run, sub-project nesting. Must end `SMOKE DONE` with no FAIL.
