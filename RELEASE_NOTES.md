# Release notes

## v2.0.0

**Release date:** 2026

### Highlights

- **SQL-first exports:** append `INSERT` rows to `.sql` files under `./exports/`. New files include a sentinel line and comments listing all column names (same order as `CSV_HEADERS` in `src/models/player-stats-csv-model.js`), then `INSERT INTO "player_stats" (...)` statements (`src/utils/sql-append.js`).
- **Public programmatic API:** `getRandomActiveRankedPlayerToSql`, `getActiveRankedPlayerByIdToSql`, `getFactionPlayersByHofRankToSql` (`src/index.js`).
- **MVC-style layout:** `src/controllers/`, `src/models/`, `src/views/`, `src/services/`, `src/api/`, `src/utils/`.
- **Static Torn API key pool** with automatic failover on rate limit and related fatal codes (`src/static-api-keys.js`, `src/api/torn-client.js`).
- **Per-API default `.sql` paths:** `./exports/random-active-ranked-player-stats.sql`, `./exports/active-ranked-player-by-id-stats.sql`, `./exports/faction-hof-rank-player-stats.sql` (overridable via CLI `SQL_PATH`, `options.sqlPath`, or env; legacy `options.csvPath` and `*_CSV` env names still accepted as fallbacks).
- **Windows-friendly file writes:** retries and clear errors when the export file is locked.

### Breaking changes (vs earlier CSV / `ToCsv` naming)

- Programmatic methods named `get*ToCsv` are replaced by `get*ToSql`; output is SQL, not CSV.
- Removed `src/utils/csv-append.js` in favor of `sql-append.js`.
- Thin `*-csv.js` service wrappers were merged into the main service modules where applicable.
- Controller file: `player-stats-export-controller.js`. Faction export service: `faction-hof-rank-player-stats-sql.js`.

### Xanax scoring

- Monthly window uses Torn **v2** cumulative `xantaken` snapshots (all-time vs timestamped), with `xanaxTakenDuringLastMonth` as the delta.
- Typical **three** Torn calls for by-id when faction and company names are available from profile.

### CLI

- Runner scripts may still be named `run-*-csv.js` for historical reasons only; they call the SQL export stack.
- Faction HoF: `node run-faction-hof-rank-csv.js HOF_RANK [SQL_PATH] [MAX_PLAYERS]` or short form `node run-faction-hof-rank-csv.js HOF_RANK MAX_PLAYERS` (default `.sql` path when path omitted).

### Documentation

- `README.md` describes SQL defaults, optional paths, env vars, and the random runner `PERIOD` token (positional only; scoring always uses the monthly v2 delta).

---

## v1.0.2 (latest patch updates)

### Post-release updates

*Historical note: the `TORN_XANAX_MODE` items below describe an older v1-era behavior. **v2.0.0+** does not implement that env switch; use the current README and v2.0.0 section above.*

- Added **ageDays**, **ageMonths**, and **ageYears** to both APIs (`random-active-ranked-player` and `active-ranked-player-by-id`).
- Added **allTimeXanaxTaken** to both APIs (lifetime `xantaken` from Torn `personalstats`).
- Added **xanaxMode** response field and unified env switch `TORN_XANAX_MODE=fast|probe`.
- Set **fast mode as default** for lower API usage and recruitment readiness.
- Optimized by-id call behavior in fast mode (minimal calls); kept probe mode for deeper xanax diagnostics when needed.
- Updated CLI headers and README docs to reflect the new fields, mode switch, and API-call expectations.

---

## v1.0.2

**Release date:** 2026

### Changes since v1.0.1

| Area | v1.0.1 | v1.0.2 |
|------|--------|--------|
| **Active ranked API** | Only random probing (`active-ranked-player`) to find a matching active player. | Added `active-ranked-player-by-id` so you can score a specific `playerId` directly (no random probing). |
| **Xanax score (100%)** | 100% score at **3.25** lifetime avg xanax per day. | 100% score at **3** lifetime avg xanax per day. |

### Summary

- **New recruitment helper:** use `run-active-ranked-by-id-csv.js` / by-id export API when you already have an ID (see current README for `*ToSql` names in v2).
- **Softer scoring:** lowered the full xanax score bar from 3.25 to 3 xanax/day, producing higher numeric scores and tiers for the same usage.

---

## v1.0.1

**Release date:** 2025

### Changes since v1.0.0

| Area                   | v1.0.0                                                     | v1.0.1                                                                                    |
| ---------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| **Tier filter**        | TIER matched **exactly** (e.g. `C` = only C-tier players). | TIER means **this tier or higher** (e.g. `C` = C, B, A, or S; `S` = S only).              |
| **Xanax score (100%)** | 100% score at **4** lifetime avg xanax per day.            | 100% score at **3.25** lifetime avg xanax per day (softer, higher scores for same usage). |

### Summary

- **Tier filter:** Requesting `C`, `B`, or `A` now returns any player at that tier or better, so you get more results when filtering (e.g. "C or higher" instead of "exactly C").
- **Scoring:** The bar for a full xanax score is lowered from 4 to 3.25 xanax/day, so the same usage yields a higher numeric score and tier.

---

## v1.0.0

- Random active player API with xanax-based tier (S/A/B/C/D).
- Single API call per try (profile + personalstats combined) to minimize Torn API usage.
- Tier thresholds: S >= 75, A >= 60, B >= 40, C >= 25, D < 25 (scores 0-100).
- Filters: active hours, ID range, max tries, period (day/month), tier (exact), has faction, has company.
- Response: playerId, name, level, xanScore, tier, faction/company names, tornApiCallsUsed, etc.
- Refactored codebase (constants, API client, utils, services) and improved error messages.
