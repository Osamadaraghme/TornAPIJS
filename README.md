# TornAPIJS

SQL-export Torn recruitment APIs in JavaScript.

**Version:** **3.0.2** ([`package.json`](package.json), [`RELEASE_NOTES.md`](RELEASE_NOTES.md)). **v3** is a major web-focused release: **local admin controls**, first-run setup, gitignored settings, per-field saves, and live scoring in the export viewer — see **`/release-notes`** for the full list.

Exports write `INSERT` rows to `.sql` files under `exports/` (created if missing). For a normal TornAPIJS export file, saving again for the same **`playerId` replaces that row** (full refresh from the API) instead of appending a duplicate; other rows stay as they are. New files list every column in model order (`CSV_HEADERS` in `src/models/player-stats-csv-model.js`).

**In-page links** (`#section-id`): slugs follow the same rules as **GitHub** (via `github-slugger` in `web/server.js`), so fragments work on **github.com** and in the local **`/readme`** and **`/release-notes`** pages.

### Official Torn links

- [Torn API documentation](https://staticfiles.torn.com/api.html) — selections, error codes, rate limits  
- [API v2 (Swagger)](https://www.torn.com/swagger.php) — e.g. `GET /v2/user/{userId}/personalstats`  
- [API keys (in-game)](https://www.torn.com/preferences.php#tab=api) — create or manage keys under Torn **Preferences → API**  
- [Torn City](https://www.torn.com/) — main game site  

HTTP requests use the effective **`API_BASE`** from [`src/constants-defaults.js`](src/constants-defaults.js) (not editable via the control panel; change the defaults file or fork if you need another origin).

---

## Web UI

The browser UI uses the same controllers as the CLI. **Default URL:** [`http://localhost:3847`](http://localhost:3847) (override with env **`TORN_WEB_PORT`**). With the server running, append any path below (e.g. [`http://localhost:3847/api/by-id`](http://localhost:3847/api/by-id)).

After a successful **Random ranked**, **Player by ID**, or **Faction HoF** run, the HTML result includes **Copy data** — one click copies the full result text (no manual select-all). On **Saved player data** file viewers (`/exports/view/…`), each player column has **Copy data** for that player’s saved row. In **v3**, **table view** (not raw SQL) **recomputes** xan / time / combined scores and tier from the stored stats using **current** scoring settings each time you open the file; the `.sql` file on disk is unchanged.

### Setup and run

```powershell
npm install
npm run web
```

If PowerShell blocks scripts, use **`npm.cmd run web`** or **`node web\server.js`** from the project root.

### Stop the server / port in use

- In the terminal where the server runs, press **Ctrl+C**.
- If you see **`EADDRINUSE`** on port **3847**:

```powershell
Get-NetTCPConnection -LocalPort 3847 | Select-Object OwningProcess
Stop-Process -Id <PID> -Force
```

Or use another port without stopping the old process:

```powershell
$env:TORN_WEB_PORT = "3848"
node web/server.js
```

### Environment

Default keys are listed in **`src/static-api-keys.js`** (`TORN_PUBLIC_API_KEYS`) and should stay placeholder-only unless intentionally public. To use a single key without editing that file, set **`TORN_API_KEY`**.

### Runtime settings (control panel)

- **First run:** If the local settings JSON does not exist yet, the site sends you to **[`/first-run`](http://localhost:3847/first-run)** to create it (admin token, optional API keys, optional **settings profile**). Those paths are **gitignored**; do not commit them. On shared or public hosts, set **`FIRST_RUN_SECRET`** and send the same value as header **`X-First-Run-Secret`** when submitting the wizard.
- **Page:** [`/admin/control-panel`](http://localhost:3847/admin/control-panel) — after the file exists, click **Load**, edit values, then use **Update** beside a single field (immediate one-key API save) or **Save all changes** for everything you changed. The page can keep the admin token in **sessionStorage** for convenience. Successful saves show a **brief highlight** on the field and a pulse on the status line. If **`TORN_ADMIN_TOKEN`** is not set, create the bcrypt-stored token here or during first-run.
- **Settings file:** default **`data/tornapijs-control.json`** (pretty-printed JSON). Override the full path with **`TORN_SETTINGS_DB_PATH`**. For a **separate file per operator** on one machine, set **`TORN_ADMIN_PROFILE`** (e.g. `alice` → `data/tornapijs-control-alice.json`) or choose a profile name in the first-run wizard (writes **`data/.local-runtime-profile.json`** when env profile is not set).
- **Optional env override:** if **`TORN_ADMIN_TOKEN`** is set on the server, it **replaces** the stored hash for API checks (useful for automation). To rely only on the UI-created token, leave **`TORN_ADMIN_TOKEN`** unset.
- **Change token:** when not using the env override, use **Change admin token** on the same page (`PUT /api/admin/change-admin-token` with a valid bearer token).
- **JSON API:** `GET /api/admin/settings` and `PUT /api/admin/settings` with `Authorization: Bearer <token>`. `PUT` body is a JSON object of setting names → values; use **`null`** to remove an override (fall back to defaults / `static-api-keys.js` for the key pool).
- **Public status:** `GET /api/admin/auth-status` returns whether first-run setup is still required (`needsBootstrap`).

### Constants reference (defaults + admin overrides)

Built-in defaults live in **`src/constants-defaults.js`**. At runtime, [`getMergedConstants()`](src/constants.js) merges those with **only** the keys the admin may change in the local settings JSON (default **`data/tornapijs-control.json`**; see `src/settings/settings-repository.js` and `OVERRIDE_KEYS` in `src/runtime-config.js`):

| Area | Names | Role |
|------|--------|------|
| Key pool | `TORN_PUBLIC_API_KEYS` | Array of 16-char keys; if unset in the JSON file, **`src/static-api-keys.js`** is used. Resolution order for requests is still: explicit key → **`TORN_API_KEY`** → merged public pool. |
| Scoring | `AVG_DAYS_PER_MONTH`, `XANAX_PER_DAY_FOR_FULL_SCORE`, `HOURS_PER_DAY_FOR_FULL_TIME_SCORE` | Month length for averages; daily xanax / daily hours targets for 100% sub-scores. |
| Tier mix | `RECRUITMENT_TIER_XAN_WEIGHT`, `RECRUITMENT_TIER_TIME_WEIGHT` | Must sum to **1** (default 0.75 / 0.25). |

All other tunables (`API_BASE`, default SQL paths, Torn error maps, etc.) come **only** from `src/constants-defaults.js` (or code paths that pass explicit options), not from the admin JSON.

### Pages

| Path | Purpose |
|------|---------|
| [`/`](http://localhost:3847/) | Home, shortcuts, list of `.sql` files in `exports/` |
| [`/api/random`](http://localhost:3847/api/random) | Random active ranked → append one row |
| [`/api/by-id`](http://localhost:3847/api/by-id) | Player by ID (`?playerId=` or `?q=` pre-fills the ID) |
| [`/api/faction-hof`](http://localhost:3847/api/faction-hof) | Faction Hall of Fame rank → append rows |
| [`/exports`](http://localhost:3847/exports) | Index of all `exports/*.sql` |
| [`/first-run`](http://localhost:3847/first-run) | One-time setup when no local settings JSON exists yet |
| [`/admin/control-panel`](http://localhost:3847/admin/control-panel) | Runtime settings editor (create admin token in-browser, or use **`TORN_ADMIN_TOKEN`**) |
| `/exports/view/<file>.sql` | Table or raw SQL (e.g. [`/exports/view/active-ranked-player-by-id-stats.sql`](http://localhost:3847/exports/view/active-ranked-player-by-id-stats.sql); time played shown as days/hours; DB still stores seconds) |
| [`/readme`](http://localhost:3847/readme) | This file (rendered) |
| [`/release-notes`](http://localhost:3847/release-notes) | Changelog |
| [`/about`](http://localhost:3847/about) | Author note |

### Navigation shortcuts

- **Docs** (footer on every page): **README**, **Release notes**, and **About** — moved out of the main header in v3 for a cleaner tool bar.
- **Quick go** (header): type to filter pages; **Ctrl+K** / **Cmd+K** or **`/`** (when not in a form field) focuses it; **Enter** opens the highlighted row.
- **Digits only** (e.g. `3225726`): jump to **Player by ID** with that ID filled (`/api/by-id?playerId=…`).
- **Search again** on API result pages returns to the same form (above the full result details).

### Export table (viewer)

- **Copy data** appears in each player column header; it copies that player’s saved record as plain text you can paste elsewhere.
- **Player name** and **player ID** in each column header link to Torn profiles — pattern [`https://www.torn.com/profiles.php?XID={id}`](https://www.torn.com/profiles.php?XID=1) (no duplicate “Player name” row in the table).
- **Faction** and **company** names link when the row has **`factionId`** and **`companyId`** (new exports from v2.3.0): [`factions.php?step=profile&ID=…`](https://www.torn.com/factions.php?step=profile&ID=1), [`companies.php?ID=…`](https://www.torn.com/companies.php?ID=1). Older `.sql` files without those columns show plain text until you append new rows or normalize the file (e.g. row delete in the viewer fills missing columns with `NULL`).

### Project layout (web)

- `web/server.js` — Express app and HTML.
- `web/admin-settings-routes.js` — admin JSON routes + control panel page wiring.
- `src/services/admin-token-service.js` — admin bearer token (env or bcrypt in settings JSON) + bootstrap/change helpers.
- `web/public/admin-control.js` — control panel client (load/save settings).
- `web/controllers/saved-player-export-controller.js` — saved `.sql` file mutations (delete rows, clear all rows, **Update**). **Update** calls `exportPlayerByIdToSql` from `src/controllers/player-stats-csv-controller.js`, the same entry point as `/api/by-id` and the CLI.
- `web/public/style.css` — styles.
- `web/public/site.js` — header quick-jump behavior.

---

## API keys

### How keys are chosen

Resolution order (see `resolveApiKeys` in `src/api/torn-client.js`):

1. Key(s) passed into the API method (if supported).
2. Environment variable **`TORN_API_KEY`** (single key).
3. The static pool in **`src/static-api-keys.js`** (`TORN_PUBLIC_API_KEYS` array).

If Torn returns rate-limit [**code 5**](https://staticfiles.torn.com/api.html) (“too many requests”), the client tries the **next** key in the resolved list.

### Adding a key to the shared pool (for contributors)

To let everyone benefit from more keys (higher shared rate limit headroom):

1. Open **`src/static-api-keys.js`**.
2. Add your **16-character** Torn public API key as a new string inside the **`TORN_PUBLIC_API_KEYS`** array.

Example:

```javascript
const TORN_PUBLIC_API_KEYS = [
    'Your16CharKeyHere',
    'Another16CharKey',
];
```

3. Save the file. Duplicates are ignored at runtime (`uniqueKeys` in `torn-client.js`).
4. **Do not** commit keys you are not allowed to share. Prefer a **pull request** so maintainers can review; revoke the key in [Torn API preferences](https://www.torn.com/preferences.php#tab=api) if it is ever exposed unintentionally.

For **local-only** use without editing the repo, set **`TORN_API_KEY`** instead.

---

## Constants (`src/constants.js`)

Tunable values live in **`src/constants.js`**. Edit that file, save, and restart the web server or run the CLI again. Anything that `require`s this module picks up the new values.

| Constant | Role |
|----------|------|
| **`AVG_DAYS_PER_MONTH`** | Divisor when turning monthly xanax / time deltas into per-day averages (default **30.4375**). |
| **`XANAX_PER_DAY_FOR_FULL_SCORE`** | Lifetime or monthly-derived **avg Xanax/day** that maps to a **100** xan score (default **3**). Lower = easier to max the xan component. |
| **`HOURS_PER_DAY_FOR_FULL_TIME_SCORE`** | **Avg hours played/day** (from the last-month time window) that maps to **100** on the time component (default **3**). |
| **`RECRUITMENT_TIER_XAN_WEIGHT`** / **`RECRUITMENT_TIER_TIME_WEIGHT`** | Weights for **combined** tier score (default **0.75** / **0.25**). They should **sum to 1**. |
| **`DEFAULT_*_STATS_SQL_PATH`** | Default `.sql` output paths for each API (unless overridden by CLI, options, or env). |
| **`API_BASE`** | Torn API host (normally leave as [`https://api.torn.com`](https://api.torn.com)). |
| **`TORN_ERROR_MESSAGES`** / **`TORN_FATAL_ERROR_CODES`** | Error text and which Torn codes stop retries (`src/api/torn-client.js`); codes are documented under [Torn API errors](https://staticfiles.torn.com/api.html). |

**Tier letter cutoffs** (e.g. S ≥ 90, A ≥ 80) are **not** in `constants.js`; they are in **`src/utils/scoring.js`** (`tierForFinalScore` and related helpers). Change those if you want different S/A/B/C/D/F boundaries.

Scoring math that uses the constants above is implemented in **`src/utils/scoring.js`**.

---

## Quick API overview (CLI)

| API | What it does | Example |
|-----|----------------|---------|
| Random active ranked | One random active player → one `INSERT` | `node run-active-ranked.js 24 1 3000000 120 month C ANY ANY` |
| Player by ID | One player → one `INSERT` | `node run-active-ranked-by-id-csv.js 3532802` |
| Faction HoF rank | One faction by HoF rank → one `INSERT` per member (optional cap) | `node run-faction-hof-rank-csv.js 1 20` |

Runner names still contain `csv` for history only; output is **SQL**.

Programmatic exports: `getRandomActiveRankedPlayerToSql`, `getActiveRankedPlayerByIdToSql`, `getFactionPlayersByHofRankToSql` (`src/index.js`).

---

## CLI: Random active ranked

```powershell
node run-active-ranked.js
```

Positional arguments (fill earlier slots to use later ones):

```text
ACTIVE_HOURS MIN_ID MAX_ID MAX_TRIES PERIOD TIER HAS_FACTION HAS_COMPANY [MIN_LEVEL] [SQL_PATH]
```

The 6th token (`PERIOD`) keeps CLI compatibility only; the service **always** uses the **monthly v2** window for xanax and time (`v2-recruitment-stats` in exports). Use `month` in examples.

**Tier filter** (`TIER`, case-insensitive): `S` → S only; `A` → A or S; `B` → B+; `C` → C+; `D` → D+; `F` → any; `ALL` → no tier filter.

**Score bands** (from **`combinedScore`**, 75% xan / 25% time — [How scoring works](#how-scoring-works-xan-score-and-tier)):

| Band | `combinedScore` |
|------|-----------------|
| S | ≥ 90 |
| A | ≥ 80 and &lt; 90 |
| B | ≥ 70 and &lt; 80 |
| C | ≥ 60 and &lt; 70 |
| D | ≥ 50 and &lt; 60 |
| F | &lt; 50 |

Examples (default `./exports/random-active-ranked-player-stats.sql`):

```powershell
node run-active-ranked.js 24 1 3000000 120 month ALL ANY ANY
node run-active-ranked.js 24 1 3000000 120 month C N ANY 15
```

Optional 12th argument: `[SQL_PATH]`.

---

## CLI: Player by ID

```powershell
node run-active-ranked-by-id-csv.js PLAYER_ID [SQL_PATH]
```

Example (default `./exports/active-ranked-player-by-id-stats.sql`):

```powershell
node run-active-ranked-by-id-csv.js 3532802
```

---

## CLI: Faction HoF rank

```powershell
node run-faction-hof-rank-csv.js HOF_RANK [SQL_PATH] [MAX_PLAYERS]
# Short form (default .sql path):
node run-faction-hof-rank-csv.js HOF_RANK MAX_PLAYERS
```

Examples (default `./exports/faction-hof-rank-player-stats.sql`):

```powershell
node run-faction-hof-rank-csv.js 1
node run-faction-hof-rank-csv.js 1 20
```

---

## SQL file format and defaults

| API | Default file |
|-----|----------------|
| Random | `./exports/random-active-ranked-player-stats.sql` |
| By ID | `./exports/active-ranked-player-by-id-stats.sql` |
| Faction HoF | `./exports/faction-hof-rank-player-stats.sql` |

- New files: sentinel line, header comments with column names, then multi-line `INSERT INTO "player_stats" (...)` / `VALUES (...)`. Strings are HTML-entity decoded before quoting (`src/utils/sql-append.js`). Re-fetching the same player rewrites that player’s `INSERT` in place (`upsertByPlayerId`, default on); pass `{ upsertByPlayerId: false }` to `appendSqlRow` to always append.
- Rows include **`name`**, **`playerId`**, and **`factionId`** / **`companyId`** in SQL; **name** and **player ID** are shown in each column header, and those columns are omitted from the transposed field list (faction/company **names** still link when IDs exist).
- Override path: CLI `[SQL_PATH]`, or `options.sqlPath` / `options.csvPath` (legacy) in code.
- Env per API: `TORN_RANDOM_STATS_SQL`, `TORN_BY_ID_STATS_SQL`, `TORN_FACTION_HOF_STATS_SQL` (legacy `*_CSV` / `TORN_STATS_CSV` still accepted).
- Global fallback: `TORN_STATS_SQL` or `TORN_STATS_CSV`.
- HoF member cap: `TORN_FACTION_MEMBER_LIMIT`.

---

## How scoring works (Xan score and tier)

Implemented in `src/utils/scoring.js`; constants in `src/constants.js`.

### Average Xanax per day

- **Monthly window:** Torn [**v2** `personalstats`](https://www.torn.com/swagger.php) cumulative **`xantaken`**: last-month intake = `xanaxTakenDuringLastMonth` (all-time minus value at “one month ago”). Divided by **`AVG_DAYS_PER_MONTH` (30.4375)** → **`avgXanaxPerDay`**.
- **Fallback:** Lifetime `xantaken` / account age in days.

### Xan score (0–100)

```text
xanScore = min(avgXanaxPerDay / XANAX_PER_DAY_FOR_FULL_SCORE, 1) * 100
```

**`XANAX_PER_DAY_FOR_FULL_SCORE`** = **3** (3/day → 100, capped).

### Average time played (0–100)

Same monthly snapshot pattern for **`timeplayed`** (seconds) → **`avgTimePlayedHoursPerDay`**.

```text
averageTimeScore = min(avgHoursPerDay / HOURS_PER_DAY_FOR_FULL_TIME_SCORE, 1) * 100
```

**`HOURS_PER_DAY_FOR_FULL_TIME_SCORE`** = **3** (3 h/day average over the window → 100, capped).

### Combined score and tier

```text
combined01 = 0.75 * (xanScore as 0–1) + 0.25 * (averageTimeScore as 0–1)
combinedScore = combined01 * 100
```

Weights: **`RECRUITMENT_TIER_XAN_WEIGHT`**, **`RECRUITMENT_TIER_TIME_WEIGHT`** in `src/constants.js`.

Tier bands use **`combinedScore`** (same table as in [Random active ranked](#cli-random-active-ranked)).

### Other (v2.2.0)

- **`activestreak`** from the same [v2 `personalstats`](https://www.torn.com/swagger.php) batch (not used in tier).
- Two v2 **`GET /v2/user/{userId}/personalstats`** calls per player (all-time batch + month-ago batch); see [Swagger](https://www.torn.com/swagger.php) for parameters (`stat`, `timestamp`, etc.). When the player has a **`factionId`**, one additional **`GET /faction/{id}?selections=rankedwars,basic`** is used for **`rankedWarsParticipatedLastMonth`** (not used in tier).

---

## Notes on xanax and timeplayed windows

- **Xanax:** `xanaxTakenDuringLastMonth = allTimeXanaxTaken - xanaxTakenUntilLastMonth`.
- **Ecstasy (informational):** `ecstasyTakenDuringLastMonth = allTimeEcstasyTaken - value(exttaken)` at “one month ago”. Not used in tier or combined score.
- **Ranked war hits:** cumulative **`rankedwarhits`** from the same two v2 `personalstats` snapshots → `allTimeRankedWarHits` and `rankedWarHitsDuringLastMonth` (delta). Not used in tier.
- **Ranked wars participated (last month):** one extra **`GET /faction/{id}?selections=rankedwars,basic`** per player when they have a faction. Wars whose timeline overlaps the rolling last-month window are counted only if the member’s **`days_in_faction`** implies they had already joined before the war ended (join time estimated as `now − days_in_faction × 86400`). **Not used in tier.**
- **Time played:** same idea for **`timeplayed`** seconds → `timePlayedDuringLastMonth`, plus all-time / until-last-month columns.
- Exports include xanax, ecstasy, ranked-war fields, time fields, **`averageTimeScore`**, **`combinedScore`**, **`activeStreak`**, **`avgXanaxPerDay`**.

---

## Architecture (MVC + services)

- `src/controllers/` — Controllers for CLI and programmatic use.
- `src/models/` — Export columns and row mapping.
- `src/views/` — CLI formatting.
- `src/services/` — Torn orchestration and scoring pipeline.
- `src/api/` — HTTP client and key failover (`torn-client.js`).
- `src/utils/` — Extractors, scoring helpers, monthly v2 recruitment stats, ranked-war participation (`faction-ranked-wars-participation.js`), errors, SQL append.
- `src/constants.js` — Tunable scoring, default paths, API/error metadata (see [Constants](#constants-srcconstantsjs)).
- `src/static-api-keys.js` — Default API key pool.
- `src/index.js` — Public exports (`player-stats-csv-controller.js`).
