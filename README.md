# Madison Centralized Development Tracker 🖥️

Isang centralized development tracker para sa **lahat ng systems ni Madison** — hindi per-team spreadsheet, hindi generic PM tool.
Dev-focused project management: System → Project → Ticket, na may branch/PR/environment/deploy tracking.

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
2. In Netlify, set `MDT_API_BASE_URL` to the HTTPS URL of the VPS API, for example `https://api.example.com`.
3. Netlify uses `netlify.toml`: no framework build is required; it generates `public/runtime-config.js` and publishes `public/`.
4. Run the backend with PM2: `npm install`, `pm2 start ecosystem.config.cjs`, then `pm2 save` and `pm2 startup`.
5. Install the backup timer from `deploy/`: copy the service and timer to `/etc/systemd/system/`, run `systemctl daemon-reload`, `systemctl enable --now madison-tracker-backup.timer`, and verify with `systemctl list-timers`.

The VPS should expose the API through HTTPS (Nginx/Caddy + a TLS certificate). The frontend uses the same configured API base for normal requests, PPT exports, JSON export, and SSE realtime updates.

## 3-stage flow (v1.2)
**Pipeline → In Development → Completed.** Drag-drop lang sa Kanban, auto-log sa updates + activity.
Smoke test: `node smoke-test.js` (server must be running).

Walang build step, walang DB setup. Data nasa `data/db.json` (HQ sync ang nagpopondo ng projects + tickets).

## Functions (deep-dive design)
1. **Systems Registry** — lahat ng Madison systems (owner, tech, repo, dev/staging/prod URLs, health).
2. **Projects + Sub-projects** — title, description, deadline per project/sub; **% auto-computed from tickets** (never stored); SDLC stage bars (pipeline → in dev → completed); click project = filtered board.
   **HQ sync** — "Sync HQ" button pulls live projects + progress from `m88-it-headquarters.netlify.app` (Supabase) into a "M88 HQ Systems" group; HQ % shows as badge next to our ticket-derived %. Re-run anytime, idempotent (no duplicates).
2. **Tickets** — Feature/Bug/Hotfix/Incident/Task/Docs + Critical→Low, estimate pts, % progress, due, labels.
3. **3-stage flow** — Pipeline → In Development → Completed. Walang jargon, drag-drop lang. **Color per system** (HRIS blue, Inventory amber, POS green, CRM purple, Web pink — editable) + **due highlights** (⚠ overdue pula, ⏰ due soon amber).
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
