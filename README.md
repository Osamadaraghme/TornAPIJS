# TornAPIJS

SQL-export Torn recruitment APIs in JavaScript.

All public APIs append `INSERT` rows to `.sql` files (create if missing, append if they exist). New files include comment lines that list every column name in the same order as the model (`CSV_HEADERS` in `src/models/player-stats-csv-model.js`).

## Architecture (MVC + services)

- `src/controllers/` - API controllers used by CLI and programmatic entry points
- `src/models/` - Column definitions and row mapping for exports
- `src/views/` - CLI output formatting
- `src/services/` - business logic and Torn API orchestration
- `src/api/` - low-level Torn HTTP client with key failover
- `src/utils/` - extractors, scoring, errors, helpers, SQL append utility
- `web/` - optional Express browser UI (`npm run web`)
- `src/index.js` - public SQL export exports (`src/controllers/player-stats-csv-controller.js`)

## API key behavior

- Default key pool is in `src/static-api-keys.js`.
- Current default key is `Bf0F4qebJLvo2Mj0`.
- You can override with `TORN_API_KEY`.
- If Torn returns rate-limit code `5`, the client tries the next key in the pool.

## Web UI

Install dependencies once:

```powershell
npm install
```

Start the server (default **http://localhost:3847**; override with env `TORN_WEB_PORT`):

```powershell
npm run web
```

**Stop the server / close the previous connection**

- In the **same terminal** where the web UI is running, press **Ctrl+C** to stop Node and release the listen port (default **3847**).

If you start again and see **`EADDRINUSE: address already in use`**, a previous Node process is still bound to that port. On **PowerShell**, find its process ID and stop it:

```powershell
Get-NetTCPConnection -LocalPort 3847 | Select-Object OwningProcess
Stop-Process -Id <PID> -Force
```

(Replace `<PID>` with the number from `OwningProcess`.) Alternatively, start on another port without stopping the old instance:

```powershell
$env:TORN_WEB_PORT = "3848"
node web/server.js
```

If `npm run web` is blocked by **execution policy** on PowerShell, use **`npm.cmd run web`** or **`node web\server.js`** from the project root.

The UI uses the same export controllers as the CLI. Pages:

| Path | Purpose |
|------|---------|
| `/` | Home with shortcuts and a list of current `.sql` files in `exports/` |
| `/api/random` | Random active ranked (form submits to append one `INSERT`) |
| `/api/by-id` | Player by ID |
| `/api/faction-hof` | Faction HoF rank export |
| `/exports` | Index of all `exports/*.sql` files (dynamic) |
| `/exports/view/<file>.sql` | Read-only view of one export file (time played columns show days & hours; SQL still stores seconds) |
| `/readme` | This documentation rendered from `README.md` |
| `/release-notes` | Changelog rendered from `RELEASE_NOTES.md` |
| `/about` | Short bio / credits for the author |

Set `TORN_API_KEY` in the environment if you are not using the default key pool.

## Quick API list

| API | What it does | CLI call |
|---|---|---|
| Random active ranked -> SQL | Finds one random active player by filters and appends one `INSERT` | `node run-active-ranked.js 24 1 3000000 120 month C ANY ANY 15` |
| Player by ID -> SQL | Fetches one player, computes monthly xanax delta fields, and appends one `INSERT` | `node run-active-ranked-by-id-csv.js 3532802` |
| Faction HoF rank -> SQL | Finds faction at HoF rank and appends one `INSERT` per member (up to cap) | `node run-faction-hof-rank-csv.js 1 20` |

Default `.sql` paths are under `./exports/` (see below). Optional `[SQL_PATH]` overrides are documented in each section. Some runner filenames still include `csv` for historical reasons only.

All three return JSON output that includes export metadata (`path`, `created`) and player/faction data while writing to `.sql`.

Programmatic entry points: `getRandomActiveRankedPlayerToSql`, `getActiveRankedPlayerByIdToSql`, `getFactionPlayersByHofRankToSql` (see `src/index.js`).

## Random active ranked API

Run:

```powershell
node run-active-ranked.js
```

Arguments (positional — earlier slots must be filled to reach later ones):

```text
ACTIVE_HOURS MIN_ID MAX_ID MAX_TRIES PERIOD TIER HAS_FACTION HAS_COMPANY [MIN_LEVEL] [SQL_PATH]
```

The 6th token (`PERIOD`) is only there to keep argument positions aligned with older CLIs; **the random ranked service always uses the monthly v2 window** for xanax and time played (`v2-recruitment-stats` in exports) and does not read `day` vs `month`. Pass `month` in examples.

Tier behavior (`TIER` is case-insensitive):
- `S` -> S only
- `A` -> A or S
- `B` -> B, A, or S
- `C` -> C, B, A, or S
- `D` -> D, C, B, A, or S
- `F` -> any tier
- `ALL` -> ignore tier filter

Tier score ranges (from **`combinedScore`**, 75% xan / 25% time — see [How scoring works](#how-scoring-works-xan-score-and-tier)):
- `S`: `>= 90`
- `A`: `>= 80` and `< 90`
- `B`: `>= 70` and `< 80`
- `C`: `>= 60` and `< 70`
- `D`: `>= 50` and `< 60`
- `F`: `< 50`

Examples (default `./exports/random-active-ranked-player-stats.sql`):

```powershell
node run-active-ranked.js 24 1 3000000 120 month ALL ANY ANY
node run-active-ranked.js 24 1 3000000 120 month C N ANY 15
```

Optional: append `[SQL_PATH]` as the 12th argument to write elsewhere.

## Player by ID API

Run:

```powershell
node run-active-ranked-by-id-csv.js PLAYER_ID [SQL_PATH]
```

Examples (default `./exports/active-ranked-player-by-id-stats.sql`):

```powershell
node run-active-ranked-by-id-csv.js 3532802
```

Optional: `node run-active-ranked-by-id-csv.js PLAYER_ID [SQL_PATH]`

## Faction HoF rank API

Run:

```powershell
node run-faction-hof-rank-csv.js HOF_RANK [SQL_PATH] [MAX_PLAYERS]
# short form using default .sql path:
node run-faction-hof-rank-csv.js HOF_RANK MAX_PLAYERS
```

Examples (default `./exports/faction-hof-rank-player-stats.sql`):

```powershell
node run-faction-hof-rank-csv.js 1
node run-faction-hof-rank-csv.js 1 20
```

Optional: `node run-faction-hof-rank-csv.js HOF_RANK [SQL_PATH] [MAX_PLAYERS]` when you need a custom file.

## SQL file format and defaults

- Each API has its own default `.sql` file under `./exports/`:
  - random API: `./exports/random-active-ranked-player-stats.sql`
  - by-id API: `./exports/active-ranked-player-by-id-stats.sql`
  - faction HoF API: `./exports/faction-hof-rank-player-stats.sql`
- New files start with a sentinel line and comments listing all column headers, then multi-line `INSERT INTO "player_stats" (...)` / `VALUES (...)` blocks (one row per statement). String fields are HTML-entity decoded before quoting (e.g. `&#039;` becomes a normal apostrophe). Table name is `player_stats` (see `src/utils/sql-append.js`).
- Override path per call with CLI `[SQL_PATH]`, or `options.sqlPath` / `options.csvPath` (legacy alias) in code.
- Env overrides per API: `TORN_RANDOM_STATS_SQL`, `TORN_BY_ID_STATS_SQL`, `TORN_FACTION_HOF_STATS_SQL`. Legacy `*_CSV` and `TORN_STATS_CSV` env names are still read as fallbacks.
- Global fallback: `TORN_STATS_SQL` or `TORN_STATS_CSV`.
- Optional member cap for HoF export: `TORN_FACTION_MEMBER_LIMIT`

## How scoring works (Xan score and tier)

Scoring is implemented in `src/utils/scoring.js` and uses constants from `src/constants.js`.

### Average Xanax per day

- **Monthly window (current exports):** The services use Torn **v2** cumulative `xantaken` snapshots. The intake over the last month is `xanaxTakenDuringLastMonth` (all-time total minus the total at a “one month ago” timestamp). The scorer treats that as **monthly intake** and converts it to an average **per day** by dividing by **`AVG_DAYS_PER_MONTH` (30.4375)**. That value is what backs **`avgXanaxPerDay`** in exports when the monthly delta is available.
- **Fallback:** If a period-specific total is not available, `computeScores` falls back to **lifetime** average: `xantaken` (all-time) divided by **account age in days**.

### Xan score (0–100)

The internal formula uses a 0–1 ratio, then services multiply by 100 for display:

```text
xanScore = min(avgXanaxPerDay / XANAX_PER_DAY_FOR_FULL_SCORE, 1) * 100
```

- **`XANAX_PER_DAY_FOR_FULL_SCORE`** is **3**: an average of **3 Xanax per day** maps to a **100** score; higher usage still **caps at 100**.

### Average time played (0–100)

From **v2.2.0**, exports use Torn **v2** cumulative **`timeplayed`** (seconds) the same way as xanax: all-time minus the value at a **one month ago** timestamp gives seconds played in the last month. That delta is turned into **average seconds per day** using **`AVG_DAYS_PER_MONTH`**, then into **average hours per day** (`avgTimePlayedHoursPerDay`).

```text
averageTimeScore = min(avgHoursPerDay / HOURS_PER_DAY_FOR_FULL_TIME_SCORE, 1) * 100
```

- **`HOURS_PER_DAY_FOR_FULL_TIME_SCORE`** is **6**: an average of **6 hours played per day** over that window maps to a **100** time score; more time still **caps at 100**.

### Combined score and tier (S / A / B / C / D / F)

**Tier** is **not** based on xanax alone anymore. The app builds a **combined 0–1** score, then converts it to 0–100 for banding:

```text
combined01 = 0.75 * (xanScore as 0–1) + 0.25 * (averageTimeScore as 0–1)
combinedScore = combined01 * 100
```

Constants **`RECRUITMENT_TIER_XAN_WEIGHT`** (0.75) and **`RECRUITMENT_TIER_TIME_WEIGHT`** (0.25) live in `src/constants.js`. Exports include **`xanScore`**, **`averageTimeScore`**, and **`combinedScore`** (all 0–100) so recruiters can see both components.

Tiers (`tierForFinalScore`) use **`combinedScore`**:

| Tier | Score range |
|------|-------------|
| **S** | ≥ 90 |
| **A** | ≥ 80 and &lt; 90 |
| **B** | ≥ 70 and &lt; 80 |
| **C** | ≥ 60 and &lt; 70 |
| **D** | ≥ 50 and &lt; 60 |
| **F** | &lt; 50 |

The **random ranked** runner’s `TIER` filter (“this tier or higher”) uses this **combined** tier; see the tier table under [Random active ranked API](#random-active-ranked-api).

### Other stats (v2.2.0)

- **`activestreak`** comes from the same v2 personalstats batch as current `xantaken` / `timeplayed` (current streak only; not used in tier).
- API calls: two v2 **`/v2/user/:id/personalstats`** requests per player (all-time `xantaken,timeplayed,activestreak`, then `xantaken,timeplayed` at the month-ago timestamp).

## Notes on xanax and timeplayed window accuracy

- **Xanax** month fields use Torn v2 cumulative snapshots:
  - all-time `xantaken`
  - `xantaken` at last-month timestamp
  - `xanaxTakenDuringLastMonth = allTimeXanaxTaken - xanaxTakenUntilLastMonth`
- **Time played** uses the same pattern for **`timeplayed`** (seconds): `timePlayedDuringLastMonth`, plus all-time and “until last month” columns in exports.
- Output fields (all three SQL export APIs) include xanax columns above, **time** columns (`timePlayed`, `timePlayedUntilLastMonth`, `timePlayedDuringLastMonth`, `avgTimePlayedHoursPerDay`), **scores** (`averageTimeScore`, `combinedScore`), **`activeStreak`**, and **`avgXanaxPerDay`** (from last-month xanax delta / average days per month).
