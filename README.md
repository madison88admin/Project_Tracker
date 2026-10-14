# Madison Centralized Development Tracker 🖥️

Isang centralized development tracker para sa **lahat ng systems ni Madison** — hindi per-team spreadsheet, hindi generic PM tool.
Dev-focused project management: System → Project → Ticket, na may branch/PR/environment/deploy tracking.

## Storage

The tracker keeps `data/db.json` as a local rollback copy. In production, set
`TRACKER_DATABASE_URL` to a PostgreSQL connection string. On startup the API
creates `project_tracker.tracker_state`, imports the JSON state on first use, and then
uses PostgreSQL as the source of truth. Every write is also mirrored to the
local JSON file for recovery.

Required production variables:

```ini
TRACKER_DATABASE_URL=postgresql://tracker_user:password@host:5432/tracker
TRACKER_DATABASE_SSL=require
TRACKER_DATABASE_SCHEMA=project_tracker
TRACKER_DATABASE_TABLE=tracker_state
```

If the database is unavailable, the configured production process exits instead
of silently falling back to stale data. Without `TRACKER_DATABASE_URL`, local
development continues to use the JSON file.

## Bakit ito (vs market) — benchmark summary
| Tool | Problema para sa Madison |
|---|---|
| Jira | Mabigat, mahal ($8.60/user), overkill admin, mahirap sa non-tech (HR/Finance/Stores) |
| Linear | Mabilis pero dev-only, 250-issue free cap, walang UAT/env/deploy workflow, siloed per team |
| ClickUp | Generic, overwhelming, walang built-in branch/PR/deploy truth |
| GitHub Projects | Per-repo lang, too technical para sa UAT sign-off |
| **Madison Tracker (ito)** | ✅ Portfolio view ng lahat ng systems, ✅ UAT + staging/prod statuses, ✅ branch/PR/version/deploy log built-in, ✅ self-hosted ₱0/seat, ✅ DORA-lite dashboard |

Full comparison: buksan ang app → **⚖️ Benchmark** tab.

## Takbo agad (2 commands)
```powershell
npm install
npm start
```
Buksan: http://localhost:3100 — LAN: http://<pc-ip>:3100. **Walang login — dashboard agad.**

## Netlify frontend + VPS backend

The Netlify site publishes `public/` only. The Node/Express API stays on the VPS.

1. Copy `.env.example` to `.env` on the VPS and set `MDT_CORS_ORIGINS` to the exact Netlify URL, `MDT_AUTH_TOKEN`, and the HQ Supabase variables.
2. `netlify.toml` sets the current HTTPS VPS API URL through `MDT_API_BASE_URL`; override it in Netlify if the API domain changes.
3. Netlify uses `netlify.toml`: no framework build is required; it generates `public/runtime-config.js` and publishes `public/`.
4. Run the backend with PM2: `npm install`, `pm2 start ecosystem.config.cjs`, then `pm2 save` and `pm2 startup`.
5. Install the backup timer from `deploy/`: copy the service and timer to `/etc/systemd/system/`, run `systemctl daemon-reload`, `systemctl enable --now madison-tracker-backup.timer`, and verify with `systemctl list-timers`.

The VPS should expose the API through HTTPS (Nginx/Caddy + a TLS certificate). The frontend uses the same configured API base for normal requests, PPT exports, JSON export, and SSE realtime updates.

## Business rules in simple terms

- **Project status:** A project moves through `Pipeline → Development → UAT → Live`. `On Hold` is a separate pause status and is not counted as active delivery.
- **Standard delivery phases:** Development projects use `Technical Analysis → Technical Design → Coding Development → System Internal Testing (SIT) → UAT → Go Live → Hypercare`.
- **Phase completion:** Project progress is calculated from its tasks. A phase is complete when its tasks are marked `Live`; users do not need to type a percentage for the phase.
- **After Hypercare:** Any new work requested after Hypercare is recorded as a `Change Request` instead of adding it to the original delivery flow.
- **Dates:** Each project and phase can have a start date and target end date. Extending a saved date requires a short reason, and the previous date is kept in the change history.
- **Developer availability:** Active projects are allocated automatically across the available 100%. John Carlo, Mhark, and Stephanie have a built-in 10% operational-support / BAU allowance. A project percentage can be manually overridden. Live and On Hold projects are excluded.
- **FTE benefits:** Current manual hours are compared with expected future manual hours. `Hours saved ÷ 160 = FTE capacity released`; the result is an estimate of available team capacity, not an automatic headcount reduction.
- **FTE access:** FTE Benefits is a separate reporting area visible only when the active profile is `Paul Avendano`. Non-Paul project payloads, exports, and benefit updates are blocked server-side. The Activity view is presented separately as Audit Logs.
- **Non-development systems:** `Infrastructure & System Administration` projects use `New Request → Assessment & Approval → In Progress → Validation → Completed`. `On Hold` is used when work is waiting or blocked. They do not receive the development SDLC template.

Smoke test: `node smoke-test.js` (server must be running).

For production, PostgreSQL is the source of truth. `data/db.json` is retained as a local rollback copy only.

## Functions (deep-dive design)
1. **Systems Registry** — lahat ng Madison systems (owner, tech, repo, dev/staging/prod URLs, health).
2. **Projects + Sub-projects** — title, description, dates per project/phase; **% auto-computed from tasks** (never stored); SDLC stage bars; click project = filtered board.
  **HQ sync** — "Sync HQ" button pulls live projects + progress from `m88-it-headquarters.netlify.app` (Supabase) into the **Developers** group; HQ % shows as badge next to our ticket-derived %. Re-run anytime, idempotent (no duplicates).
2. **Tickets** — Feature/Bug/Hotfix/Incident/Task/Docs + Critical→Low, estimate pts, % progress, due, labels.
3. **5-status flow** — Pipeline → Development → UAT → Live, with On Hold as a separate pause status. **Color per system** plus **due highlights** (⚠ overdue red, ⏰ due soon amber).
4. **Dashboard + Projects + Systems + Activity** — project-centric views; sub-tasks edited inside project detail.
5. **Updating feed** — standup-style updates per ticket + global activity audit trail.
6. **Deployments** — env (Dev/Staging/UAT/Prod) + version + notes per ticket; pag Prod, auto-Completed.
8. **Git fields** — branch + PR link per ticket (next: auto-sync via webhook).
9. **Dashboard** — Pipeline / In Development / Completed counts, critical open, deploy frequency, per-system load.
10. **Avatars + due highlights** — assignee avatars with autosuggest, overdue/soon badges, color per system.
11. **Export/Import/Reset JSON** — backup + migration path to Supabase/Postgres.

## API
- `GET /api/tasks?q=&systemId=&status=&...` `POST /api/tasks` `PATCH /api/tasks/:id` `DELETE`
- `POST /api/tasks/:id/updates` `POST /api/tasks/:id/deployments`
- `GET/PATCH /api/systems` `GET /api/stats` `GET /api/activity` `GET /api/projects`

## Next upgrades (roadmap)
- Login + roles (Admin/Dev/QA/Viewer) kung kailangan ng accountability
- GitHub/GitLab webhook auto-sync, Slack/email notifs, SLA breach alerts
- Attachments, Gantt timeline, PWA mobile, approval matrix (HR/Finance sign-off)
