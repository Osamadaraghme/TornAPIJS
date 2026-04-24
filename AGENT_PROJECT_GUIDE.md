# TornAPIJS Agent Project Guide

This file is a quick onboarding guide for any new coding agent working in this repository.

## Canonical Workspace

- Project root: `C:\Users\user\IdeaProjects\TornAPIJS`
- Node runtime: `>=18` (see `package.json`)
- Main branch for active work: `develop`

## Project Purpose

TornAPIJS provides Torn recruitment helpers with:

- CLI runners that export player/faction data into SQL files.
- A web UI for running APIs and viewing/managing saved exports.
- Runtime admin settings (local JSON, first-run flow, admin token bootstrap).

## High-Level Structure

- `src/controllers/` - Thin orchestration entry points.
- `src/services/` - Business logic and Torn workflows.
- `src/api/` - Torn HTTP client and key rotation/failover.
- `src/models/` - Export schema and row shaping.
- `src/utils/` - Shared pure helpers (scoring, SQL append, parsing).
- `src/settings/` - Local JSON settings persistence.
- `web/` - Express server, routes, browser scripts/styles, export-view controller.
- `exports/` - Generated SQL output files (gitignored).
- `data/` - Local runtime control files (gitignored).

## Key Files To Understand First

- `web/server.js` - Main Express app and page wiring.
- `src/controllers/player-stats-csv-controller.js` - Shared by CLI + web export flows.
- `src/api/torn-client.js` - Torn request behavior and API key resolution.
- `src/constants-defaults.js` + `src/constants.js` + `src/runtime-config.js` - Effective runtime constants.
- `src/settings/settings-repository.js` - Local control store path/profile logic.
- `web/controllers/saved-player-export-controller.js` - Saved export row/file operations.

## Run and Verify

```powershell
npm install
npm run web
```

Then open `http://localhost:3847`.

Useful checks:

```powershell
node run-active-ranked.js
node run-active-ranked-by-id-csv.js 3532802
node run-faction-hof-rank-csv.js 1 20
```

## Runtime Data and Secrets

- Never commit real API keys or operator secrets.
- Static shared key pool lives in `src/static-api-keys.js` and should be empty or placeholder-only unless intentionally public.
- Local control files are gitignored:
  - `data/tornapijs-control.json`
  - `data/tornapijs-control-*.json`
  - `data/.local-runtime-profile.json`
- Prefer environment variables for local-only credentials (`TORN_API_KEY`, `TORN_ADMIN_TOKEN`).

## MVC/Layering Rules

- Keep controllers thin.
- Put business logic in services, not in routes/views.
- Keep API calls in `src/api/` only.
- Keep shared transformations in `src/utils/`.
- Avoid unrelated refactors in feature/fix tasks.

## Documentation Discipline

Before commit/push, ensure:

- `README.md` reflects user-facing behavior.
- `RELEASE_NOTES.md` reflects what changed.

## Common Agent Tasks

- Add feature endpoint/UI: update `web/server.js` routes + `web/public/*` scripts/styles + service/controller layer.
- Add export fields: update `src/models/player-stats-csv-model.js`, data pipeline services, and export viewer parsing/rendering.
- Adjust scoring: update `src/utils/scoring.js` and relevant constants/defaults.
- Change admin/runtime settings: update `src/runtime-config.js`, `src/settings/settings-repository.js`, and admin routes/UI.

## Git Safety Notes

- Do not commit local runtime files under `data/`.
- If a key is leaked:
  1. Remove it from tracked files immediately.
  2. Rotate/revoke it in Torn preferences.
  3. Consider history rewrite only if explicitly requested and coordinated.