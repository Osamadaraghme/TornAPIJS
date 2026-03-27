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
- `src/index.js` - public SQL export exports (`src/controllers/player-stats-export-controller.js`)

## API key behavior

- Default key pool is in `src/static-api-keys.js`.
- Current default key is `Bf0F4qebJLvo2Mj0`.
- You can override with `TORN_API_KEY`.
- If Torn returns rate-limit code `5`, the client tries the next key in the pool.

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

Arguments (positional â€” earlier slots must be filled to reach later ones):

```text
ACTIVE_HOURS MIN_ID MAX_ID MAX_TRIES PERIOD TIER HAS_FACTION HAS_COMPANY [MIN_LEVEL] [SQL_PATH]
```

The 6th token (`PERIOD`) is only there to keep argument positions aligned with older CLIs; **the random ranked service always uses the monthly xanax window** (`v2-monthly-delta`) and does not read `day` vs `month`. Pass `month` in examples.

Tier behavior (`TIER` is case-insensitive):
- `S` -> S only
- `A` -> A or S
- `B` -> B, A, or S
- `C` -> C, B, A, or S
- `D` -> D, C, B, A, or S
- `F` -> any tier
- `ALL` -> ignore tier filter

Tier score ranges (`xanScore`):
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
- New files start with a sentinel line and comments listing all column headers, then `INSERT INTO "player_stats" (...)` rows. Table name is `player_stats` (see `src/utils/sql-append.js`).
- Override path per call with CLI `[SQL_PATH]`, or `options.sqlPath` / `options.csvPath` (legacy alias) in code.
- Env overrides per API: `TORN_RANDOM_STATS_SQL`, `TORN_BY_ID_STATS_SQL`, `TORN_FACTION_HOF_STATS_SQL`. Legacy `*_CSV` and `TORN_STATS_CSV` env names are still read as fallbacks.
- Global fallback: `TORN_STATS_SQL` or `TORN_STATS_CSV`.
- Optional member cap for HoF export: `TORN_FACTION_MEMBER_LIMIT`

## Notes on xanax window accuracy

- Xanax month fields now use Torn v2 cumulative snapshots:
  - all-time `xantaken`
  - `xantaken` at last-month timestamp
  - `xanaxTakenDuringLastMonth = allTimeXanaxTaken - xanaxTakenUntilLastMonth`
- New output fields on all APIs:
  - `allTimeXanaxTaken`
  - `xanaxTakenUntilLastMonth`
  - `xanaxTakenDuringLastMonth`
  - `avgXanaxPerDay` (derived from last-month delta / average days per month)
