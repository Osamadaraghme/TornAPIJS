# TornAPIJS

SQL-export Torn recruitment APIs in JavaScript.

**Version:** **2.3.0** (`package.json`, `RELEASE_NOTES.md`).

Exports append `INSERT` rows to `.sql` files under `exports/` (created if missing). New files list every column in model order (`CSV_HEADERS` in `src/models/player-stats-csv-model.js`).

---

## Web UI

The browser UI uses the same controllers as the CLI. **Default URL:** `http://localhost:3847` (override with env **`TORN_WEB_PORT`**).

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

Set **`TORN_API_KEY`** if you are not using the default key pool (see [API keys](#api-keys)).

### Pages

| Path | Purpose |
|------|---------|
| `/` | Home, shortcuts, list of `.sql` files in `exports/` |
| `/api/random` | Random active ranked → append one row |
| `/api/by-id` | Player by ID (`?playerId=` or `?q=` pre-fills the ID) |
| `/api/faction-hof` | Faction Hall of Fame rank → append rows |
| `/exports` | Index of all `exports/*.sql` |
| `/exports/view/<file>.sql` | Table or raw SQL (time played shown as days/hours; DB still stores seconds) |
| `/readme` | This file (rendered) |
| `/release-notes` | Changelog |
| `/about` | Author note |

### Navigation shortcuts

- **Quick go** (header): type to filter pages; **Ctrl+K** / **Cmd+K** or **`/`** (when not in a form field) focuses it; **Enter** opens the highlighted row.
- **Digits only** (e.g. `3225726`): jump to **Player by ID** with that ID filled (`/api/by-id?playerId=…`).
- **Search again** on API result pages returns to the same form (above the JSON).

### Export table (viewer)

- **Player name**, **player ID**, and column headers link to Torn profiles (`profiles.php?XID=…`).
- **Faction** and **company** names link when the row has **`factionId`** and **`companyId`** (new exports from v2.3.0). Older `.sql` files without those columns show plain text until you append new rows or normalize the file (e.g. row delete in the viewer fills missing columns with `NULL`).

### Project layout (web)

- `web/server.js` — Express app and HTML.
- `web/public/style.css` — styles.
- `web/public/site.js` — header quick-jump behavior.

---

## API keys

### How keys are chosen

Resolution order (see `resolveApiKeys` in `src/api/torn-client.js`):

1. Key(s) passed into the API method (if supported).
2. Environment variable **`TORN_API_KEY`** (single key).
3. The static pool in **`src/static-api-keys.js`** (`TORN_PUBLIC_API_KEYS` array).

If Torn returns rate-limit **code 5**, the client tries the **next** key in the resolved list.

### Adding a key to the shared pool (for contributors)

To let everyone benefit from more keys (higher shared rate limit headroom):

1. Open **`src/static-api-keys.js`**.
2. Add your **16-character** Torn public API key as a new string inside the **`TORN_PUBLIC_API_KEYS`** array.

Example:

```javascript
const TORN_PUBLIC_API_KEYS = [
    'Bf0F4qebJLvo2Mj0',
    'Your16CharKeyHere',
];
```

3. Save the file. Duplicates are ignored at runtime (`uniqueKeys` in `torn-client.js`).
4. **Do not** commit keys you are not allowed to share. Prefer a **pull request** so maintainers can review; revoke the key if it is ever exposed unintentionally.

For **local-only** use without editing the repo, set **`TORN_API_KEY`** instead.

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

- New files: sentinel line, header comments with column names, then multi-line `INSERT INTO "player_stats" (...)` / `VALUES (...)`. Strings are HTML-entity decoded before quoting (`src/utils/sql-append.js`).
- Rows include **`factionId`** / **`companyId`** (with names) for web links; those ID columns are omitted from the transposed viewer table.
- Override path: CLI `[SQL_PATH]`, or `options.sqlPath` / `options.csvPath` (legacy) in code.
- Env per API: `TORN_RANDOM_STATS_SQL`, `TORN_BY_ID_STATS_SQL`, `TORN_FACTION_HOF_STATS_SQL` (legacy `*_CSV` / `TORN_STATS_CSV` still accepted).
- Global fallback: `TORN_STATS_SQL` or `TORN_STATS_CSV`.
- HoF member cap: `TORN_FACTION_MEMBER_LIMIT`.

---

## How scoring works (Xan score and tier)

Implemented in `src/utils/scoring.js`; constants in `src/constants.js`.

### Average Xanax per day

- **Monthly window:** Torn **v2** cumulative **`xantaken`**: last-month intake = `xanaxTakenDuringLastMonth` (all-time minus value at “one month ago”). Divided by **`AVG_DAYS_PER_MONTH` (30.4375)** → **`avgXanaxPerDay`**.
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

**`HOURS_PER_DAY_FOR_FULL_TIME_SCORE`** = **6** (6 h/day average over the window → 100, capped).

### Combined score and tier

```text
combined01 = 0.75 * (xanScore as 0–1) + 0.25 * (averageTimeScore as 0–1)
combinedScore = combined01 * 100
```

Weights: **`RECRUITMENT_TIER_XAN_WEIGHT`**, **`RECRUITMENT_TIER_TIME_WEIGHT`** in `src/constants.js`.

Tier bands use **`combinedScore`** (same table as in [Random active ranked](#cli-random-active-ranked)).

### Other (v2.2.0)

- **`activestreak`** from the same v2 personalstats batch (not used in tier).
- Two v2 **`/v2/user/:id/personalstats`** calls per player (all-time batch + month-ago batch).

---

## Notes on xanax and timeplayed windows

- **Xanax:** `xanaxTakenDuringLastMonth = allTimeXanaxTaken - xanaxTakenUntilLastMonth`.
- **Time played:** same idea for **`timeplayed`** seconds → `timePlayedDuringLastMonth`, plus all-time / until-last-month columns.
- Exports include xanax fields, time fields, **`averageTimeScore`**, **`combinedScore`**, **`activeStreak`**, **`avgXanaxPerDay`**.

---

## Architecture (MVC + services)

- `src/controllers/` — Controllers for CLI and programmatic use.
- `src/models/` — Export columns and row mapping.
- `src/views/` — CLI formatting.
- `src/services/` — Torn orchestration and scoring pipeline.
- `src/api/` — HTTP client and key failover (`torn-client.js`).
- `src/utils/` — Extractors, scoring helpers, errors, SQL append.
- `src/static-api-keys.js` — Default API key pool.
- `src/index.js` — Public exports (`player-stats-csv-controller.js`).
