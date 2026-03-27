# TornAPIJS

CSV-first Torn recruitment APIs in JavaScript.

All public APIs now write to CSV (create if missing, append if it exists).

## Architecture (MVC + services)

- `src/controllers/` - API controllers used by CLI and programmatic entry points
- `src/models/` - CSV record model and column definitions
- `src/views/` - CLI output formatting
- `src/services/` - business logic and Torn API orchestration
- `src/api/` - low-level Torn HTTP client with key failover
- `src/utils/` - extractors, scoring, errors, helpers, CSV append utility
- `src/index.js` - public CSV-only exports

## API key behavior

- Default key pool is in `src/static-api-keys.js`.
- Current default key is `Bf0F4qebJLvo2Mj0`.
- You can override with `TORN_API_KEY`.
- If Torn returns rate-limit code `5`, the client tries the next key in the pool.

## Quick API list

| API | What it does | CLI call |
|---|---|---|
| Random active ranked -> CSV | Finds one random active player by filters and appends one row | `node run-active-ranked.js 24 1 3000000 120 month C ANY ANY 15` |
| Player by ID -> CSV | Fetches one player, computes monthly xanax delta fields, and appends one row | `node run-active-ranked-by-id-csv.js 3532802` |
| Faction HoF rank -> CSV | Finds faction at HoF rank and appends one row per member | `node run-faction-hof-rank-csv.js 1 .\exports\player-stats.csv 20` |

All three return JSON output that includes CSV metadata (`path`, `created`) and player/faction data while writing to CSV.

## Random active ranked API

Run:

```powershell
node run-active-ranked.js
```

Arguments:

```text
ACTIVE_HOURS MIN_ID MAX_ID MAX_TRIES PERIOD(day|month) TIER HAS_FACTION HAS_COMPANY [MIN_LEVEL] [CSV_PATH]
```

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

Examples:

```powershell
node run-active-ranked.js 24 1 3000000 120 month ALL ANY ANY
node run-active-ranked.js 24 1 3000000 120 month C N ANY 15 .\exports\player-stats.csv
```

## Player by ID API

Run:

```powershell
node run-active-ranked-by-id-csv.js PLAYER_ID [CSV_PATH]
```

Examples:

```powershell
node run-active-ranked-by-id-csv.js 3532802
node run-active-ranked-by-id-csv.js 3532802 .\exports\player-stats.csv
```

## Faction HoF rank API

Run:

```powershell
node run-faction-hof-rank-csv.js HOF_RANK [CSV_PATH] [MAX_PLAYERS]
# short form using default CSV:
node run-faction-hof-rank-csv.js HOF_RANK MAX_PLAYERS
```

Examples:

```powershell
node run-faction-hof-rank-csv.js 1
node run-faction-hof-rank-csv.js 1 .\exports\player-stats.csv
node run-faction-hof-rank-csv.js 1 .\exports\player-stats.csv 20
```

## CSV defaults

- Each API has its own static default CSV file:
  - random API: `./exports/random-active-ranked-player-stats.csv`
  - by-id API: `./exports/active-ranked-player-by-id-stats.csv`
  - faction HoF API: `./exports/faction-hof-rank-player-stats.csv`
- You can override CSV per call with CLI `[CSV_PATH]` argument.
- Optional env overrides per API:
  - `TORN_RANDOM_STATS_CSV`
  - `TORN_BY_ID_STATS_CSV`
  - `TORN_FACTION_HOF_STATS_CSV`
- Optional global fallback override: `TORN_STATS_CSV`
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
