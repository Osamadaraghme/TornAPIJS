# Release notes

**Torn references:** [API documentation](https://staticfiles.torn.com/api.html) · [API v2 (Swagger)](https://www.torn.com/swagger.php) · [API keys (in-game)](https://www.torn.com/preferences.php#tab=api)

## v2.3.0

**Release date:** March 2026

### Highlights

- **Export schema:** `factionId` and `companyId` added to `CSV_HEADERS` / `buildPlayerStatsCsvRow` (`src/models/player-stats-csv-model.js`); populated from profile in `active-ranked-player-by-id` and `random-active-ranked-player` (still used by Faction HoF export).
- **Web export viewer:** Faction and company **names** link to Torn ([faction profile](https://www.torn.com/factions.php?step=profile&ID=1), [company](https://www.torn.com/companies.php?ID=1)) when IDs are present; ID columns are stored in SQL but omitted from the transposed field list (`web/server.js`).
- **Web UX:** Header **Quick go** search (`web/public/site.js`) — **Ctrl+K** / **Cmd+K** or **`/`** to focus; filter Home / APIs / exports / docs; all-digit query jumps to **Player by ID** with that ID pre-filled. **`/api/by-id?playerId=`** or **`?q=`** pre-fills the form.
- **API result pages:** Prominent **Search again** button (Random, By ID, Faction HoF — success and error).
- **Layout:** Header uses `site-header` / `nav-links` + quick jump; styles in `web/public/style.css`.
- **README:** Reorganized for readability (Web UI and API keys first; contributor instructions for adding keys in `src/static-api-keys.js`).
- **Markdown pages:** `/readme` and `/release-notes` inject **GitHub-compatible** `id` attributes on headings (`github-slugger`) so in-page `#fragment` links work in the browser, not only on github.com.
- **Docs links:** README and this file link to [Torn API docs](https://staticfiles.torn.com/api.html), [Swagger](https://www.torn.com/swagger.php), in-game [API keys](https://www.torn.com/preferences.php#tab=api), and local web UI routes (`http://localhost:3847/...`).

### Notes

- Older `.sql` exports without `factionId` / `companyId` still display; faction/company links appear after new appends or after the file is normalized to the current headers (e.g. row delete in the viewer).

### Dependencies

- **express**, **marked**, **github-slugger** (heading anchors on `/readme` and `/release-notes`).

---

## v2.2.0

**Release date:** 2026

### Highlights

- **Torn v2 personalstats (batched):** Per player, two calls — `stat=xantaken,timeplayed,activestreak` (current) and `stat=xantaken,timeplayed` with a **one month ago** timestamp — implemented in `src/utils/monthly-v2-recruitment-stats.js` and `fetchUserPersonalStatsV2` (`src/api/torn-client.js`). See [API v2 Swagger](https://www.torn.com/swagger.php) (`/v2/user/{userId}/personalstats`).
- **New export / response fields:** `timePlayed` (all-time seconds), `timePlayedUntilLastMonth`, `timePlayedDuringLastMonth`, `avgTimePlayedHoursPerDay`, `averageTimeScore` (0–100; **6 h/day** average over the window = 100%), `combinedScore` (0–100), `activeStreak` (informational; not used in tier).
- **Tier = 75% xan + 25% time:** `combinedScore = 0.75 * xanScore + 0.25 * averageTimeScore` (each 0–100); S/A/B/C/D/F bands unchanged (`tierForFinalScore`). Random **TIER** filter uses this combined tier.
- **Constants:** `HOURS_PER_DAY_FOR_FULL_TIME_SCORE`, `RECRUITMENT_TIER_XAN_WEIGHT`, `RECRUITMENT_TIER_TIME_WEIGHT` in `src/constants.js`; helpers in `src/utils/scoring.js`.
- **Web table:** Recruiter column order updated for combined / time scores (`web/server.js`).

### Dependencies

- Unchanged (**express**, **marked**).

---

## v2.1.0

**Release date:** 2026

### Highlights

- **Web export viewer:** Transposed table (recruiter field order; **Avg. Xanax / day** directly under **Xan score**), sticky field column and header row, consistent left alignment, HTML-entity–friendly display.
- **Row delete:** Each record column has **Delete**; `POST` rewrites the `.sql` file via `writeSqlExportFile` (`src/utils/sql-append.js`), normalizing rows to current `CSV_HEADERS`.
- **Torn links:** Player name, player ID, and `#id` header link to [profiles](https://www.torn.com/profiles.php?XID=1) (`profiles.php?XID=…`, new tab). Faction and company name links were added in **v2.3.0** (requires `factionId` / `companyId` in the export row).
- **Export schema:** SQL `INSERT`s omit `sourceFactionId`, `sourceFactionName`, `statsAvailable`, and `periodIsWindowed` (see `src/models/player-stats-csv-model.js`). Append logic treats any file whose first line starts with `-- TornAPIJS:player_stats:` as our export so schema changes do not duplicate headers.
- **In-browser docs:** Routes `/readme` and `/release-notes` render `README.md` and this file with **marked** (`package.json`).
- **README:** “How scoring works” (xan score, tier, monthly delta), stopping the web server and freeing port **3847** (Ctrl+C, PowerShell `Stop-Process`, optional `TORN_WEB_PORT`).
- **Branding:** Nav title **Botato's Torn Scripts** links to `/`.
- **Controller:** `src/controllers/player-stats-csv-controller.js` is the single entry used by `web/server.js` and CLI-oriented code paths.

### Dependencies

- **marked** (^15.x) for Markdown documentation pages alongside **express**.

---

## v2.0.0

**Release date:** 2026

### Highlights

- **SQL-first exports:** append `INSERT` rows to `.sql` files under `./exports/`. New files include a sentinel line and comments listing all column names (same order as `CSV_HEADERS` in `src/models/player-stats-csv-model.js`), then readable multi-line `INSERT`/`VALUES` statements; text values are HTML-entity decoded for display (`src/utils/sql-append.js`).
- **Public programmatic API:** `getRandomActiveRankedPlayerToSql`, `getActiveRankedPlayerByIdToSql`, `getFactionPlayersByHofRankToSql` (`src/index.js`).
- **MVC-style layout:** `src/controllers/`, `src/models/`, `src/views/`, `src/services/`, `src/api/`, `src/utils/`.
- **Static Torn API key pool** with automatic failover on rate limit and related fatal codes (`src/static-api-keys.js`, `src/api/torn-client.js`).
- **Per-API default `.sql` paths:** `./exports/random-active-ranked-player-stats.sql`, `./exports/active-ranked-player-by-id-stats.sql`, `./exports/faction-hof-rank-player-stats.sql` (overridable via CLI `SQL_PATH`, `options.sqlPath`, or env; legacy `options.csvPath` and `*_CSV` env names still accepted as fallbacks).
- **Windows-friendly file writes:** retries and clear errors when the export file is locked.
- **Web UI (Express):** `npm run web` serves HTML forms for all three export APIs and a dynamic index of `exports/*.sql` with per-file viewers (`web/server.js`).

### Breaking changes (vs earlier CSV / `ToCsv` naming)

- Programmatic methods named `get*ToCsv` are replaced by `get*ToSql`; output is SQL, not CSV.
- Removed `src/utils/csv-append.js` in favor of `sql-append.js`.
- Thin `*-csv.js` service wrappers were merged into the main service modules where applicable.
- Controller file: `player-stats-csv-controller.js`. Faction export service: `faction-hof-rank-player-stats-csv.js`.

### Xanax scoring

- Monthly window uses Torn **v2** cumulative `xantaken` snapshots (all-time vs timestamped), with `xanaxTakenDuringLastMonth` as the delta.
- Typical **three** Torn calls for by-id when faction and company names are available from profile.

### CLI

- Runner scripts may still be named `run-*-csv.js` for historical reasons only; they call the SQL export stack.
- Faction HoF: `node run-faction-hof-rank-csv.js HOF_RANK [SQL_PATH] [MAX_PLAYERS]` or short form `node run-faction-hof-rank-csv.js HOF_RANK MAX_PLAYERS` (default `.sql` path when path omitted).

### Web UI

- Default URL [`http://localhost:3847`](http://localhost:3847) (override with `TORN_WEB_PORT`). Requires `npm install` for dependencies in `package.json` (**express**, **marked**; later releases add **github-slugger**).

### Documentation

- `README.md` describes SQL defaults, optional paths, env vars, the web UI, and the random runner `PERIOD` token (positional only; scoring always uses the monthly v2 delta). See **v2.1.0** for scoring details and extended web UI notes.

---

## v1.0.2 (latest patch updates)

### Post-release updates

*Historical note: the `TORN_XANAX_MODE` items below describe an older v1-era behavior. **v2+** does not implement that env switch; use the current README and release notes above.*

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
