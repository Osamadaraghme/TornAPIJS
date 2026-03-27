# Release notes

## v2.0.0

**Release date:** 2026

### Highlights

- Migrated public APIs to **CSV-first** behavior:
  - `getRandomActiveRankedPlayerToCsv`
  - `getActiveRankedPlayerByIdToCsv`
  - `getFactionPlayersByHofRankToCsv`
- Added MVC-style layering for readability:
  - `src/controllers/`
  - `src/models/`
  - `src/views/`
- Added static Torn key pool with failover support in API client.
- Added robust CSV writer behavior:
  - auto-create directories/files
  - auto-ensure header line exists at line 1
  - retry and clear messaging on Windows file lock errors
- Added per-API static default CSV paths under `./exports/` with optional overrides.

### Xanax calculation changes

- Replaced ambiguous month extraction with explicit v2 snapshot delta method:
  - `allTimeXanaxTaken` from `/v2/user/:id/personalstats?stat=xantaken`
  - `xanaxTakenUntilLastMonth` from same endpoint with `timestamp=...`
  - `xanaxTakenDuringLastMonth = allTimeXanaxTaken - xanaxTakenUntilLastMonth`
- `avgXanaxPerDay` now derives from last-month delta only.
- Removed `avgXanaxPerMonth` from responses/CSV.
- Typical by-id API call count reduced to **3** when faction/company names are available from profile.

### Tier system update

- Updated tier thresholds:
  - **S** `>= 90`
  - **A** `>= 80`
  - **B** `>= 70`
  - **C** `>= 60`
  - **D** `>= 50`
  - **F** `< 50`
- Added `F` tier to ranking/filter order.

### CLI improvements

- `run-faction-hof-rank-csv.js` now supports short syntax:
  - `node run-faction-hof-rank-csv.js HOF_RANK MAX_PLAYERS`
  - example: `node run-faction-hof-rank-csv.js 1 5`
- Existing syntax remains supported:
  - `node run-faction-hof-rank-csv.js HOF_RANK [CSV_PATH] [MAX_PLAYERS]`

---

## v1.0.2 (latest patch updates)

### Post-release updates

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

- **New recruitment helper:** use `run-active-ranked-by-id-csv.js` / `getActiveRankedPlayerByIdToCsv(playerId)` when you already have an ID.
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
- Tier thresholds: S ≥ 75, A ≥ 60, B ≥ 40, C ≥ 25, D < 25 (scores 0–100).
- Filters: active hours, ID range, max tries, period (day/month), tier (exact), has faction, has company.
- Response: playerId, name, level, xanScore, tier, faction/company names, tornApiCallsUsed, etc.
- Refactored codebase (constants, API client, utils, services) and improved error messages.

