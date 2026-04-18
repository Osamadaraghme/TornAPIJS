# Release notes

**Torn references:** [API documentation](https://staticfiles.torn.com/api.html) · [API v2 (Swagger)](https://www.torn.com/swagger.php) · [API keys (in-game)](https://www.torn.com/preferences.php#tab=api)

## v3.0.1

**Release date:** April 19, 2026

### Documentation

- **Release notes:** every listed version now includes a **full calendar** **Release date** (month, day, year), aligned with git history where available.

---

## v3.0.0

**Release date:** April 18, 2026

### Highlights

This **major** release is built around **web admin controls**, gitignored local secrets, and clearer operator UX.

- **First-run & secrets:** Until the settings JSON exists, the app sends you to **`/first-run`** to create it (admin token, optional public key list, optional **settings profile**). Data stays under **`data/`** (gitignored). Optional **`FIRST_RUN_SECRET`**: the wizard must send matching **`X-First-Run-Secret`**. **`TORN_ADMIN_PROFILE`** or the wizard profile selects **`data/tornapijs-control-<slug>.json`**; **`TORN_SETTINGS_DB_PATH`** still sets an explicit file path.
- **Admin-editable scope:** The control panel may change **only** the public API key pool and **scoring** constants (days per month, xan/time “100%” targets, tier xan/time weights). **`API_BASE`**, default export paths, and Torn error maps are **not** stored or edited via admin JSON anymore; the file is **pruned** of legacy keys on load/save.
- **Control panel UX:** **Update** beside each field (one-key save), **Save all changes** for batch edits, and visible **success feedback** (field highlight + status pulse).
- **Saved SQL viewer:** Table view **recomputes** xan / time / combined scores and tier from each row’s stored stats using **current** merged constants (file on disk is unchanged). Score column tooltips describe **your settings** in short copy instead of long formulas.
- **Layout:** **README**, **Release notes**, and **About** moved to a **footer** on every page; the header keeps recruitment tools + **Settings**.

### Upgrade from 2.x

SQL export shape and CLI entry points are unchanged. Pull **`v3.0.0`**, run **`npm install`** if needed, restart **`npm run web`**. If you previously kept **`API_BASE`**, **`DEFAULT_*_STATS_SQL_PATH`**, **`TORN_ERROR_MESSAGES`**, or **`TORN_FATAL_ERROR_CODES`** overrides only in the admin JSON file, copy those values into **`src/constants-defaults.js`** (or your fork) — they are no longer applied from the settings store.

### Dependencies

Same as **v2.3.8**: **bcryptjs**, **express**, **marked**, **github-slugger** (no native SQLite driver).

---

## v2.3.8

**Release date:** April 18, 2026

### Highlights

- **First-run wizard:** Until the local settings JSON exists, the web UI redirects to **`/first-run`** so admin token, optional API key pool, and optional **settings profile** are collected and saved only on disk (gitignored).
- **Per-operator settings file:** Optional profile writes **`data/.local-runtime-profile.json`** (gitignored) and uses **`data/tornapijs-control-<slug>.json`**, or set **`TORN_ADMIN_PROFILE`** in the environment (same file naming). **`TORN_SETTINGS_DB_PATH`** still overrides the full path.
- **Lock down public installs:** Optional **`FIRST_RUN_SECRET`**: completing setup requires HTTP header **`X-First-Run-Secret`** to match.

### Notes

- Gitignore now covers **`data/tornapijs-control-*.json`** and **`data/.local-runtime-profile.json`**.

---

## v2.3.7

**Release date:** April 18, 2026

### Highlights

- **Runtime settings without native modules:** `better-sqlite3` removed. Overrides and the admin bcrypt hash now live in **`data/tornapijs-control.json`** (same `TORN_SETTINGS_DB_PATH` override). No Python / MSVC / `node-gyp` required on **Node 24** Windows.

### Notes

- If you already used **`data/tornapijs-control.sqlite`**, copy values into the new JSON file by hand or re-save from the control panel; the app no longer reads SQLite.

### Dependencies

- Removed **better-sqlite3** (still: bcryptjs, express, marked, github-slugger).

---

## v2.3.6

**Release date:** April 18, 2026

### Highlights

- **Admin token from the UI:** first-time setup at **`/admin/control-panel`** saves a **bcrypt** hash under internal key **`__admin_token_bcrypt__`** in `data/tornapijs-control.sqlite` (via `POST /api/admin/bootstrap`). No CLI env var required to get started.
- **Optional `TORN_ADMIN_TOKEN`:** if set, it still overrides verification for scripts and locked-down deploys.
- **Change token in UI:** `PUT /api/admin/change-admin-token` when the env override is not in use.

### Dependencies

- Added **bcryptjs** (existing: better-sqlite3, express, marked, github-slugger).

---

## v2.3.5

**Release date:** April 18, 2026

### Highlights

- **Runtime settings database:** SQLite file **`data/tornapijs-control.sqlite`** (override with **`TORN_SETTINGS_DB_PATH`**) stores overrides for scoring thresholds, tier weights, Torn **`API_BASE`**, default export paths, public API key pool, and optional Torn error-code maps.
- **Admin API:** `GET /api/admin/settings` and `PUT /api/admin/settings` with **`Authorization: Bearer`** matching env **`TORN_ADMIN_TOKEN`** (required to enable the API).
- **Control panel:** new page **`/admin/control-panel`** to view and edit merged settings; client script **`web/public/admin-control.js`**.
- **Code layout:** built-in defaults moved to **`src/constants-defaults.js`**; **`getMergedConstants()`** in **`src/constants.js`** merges defaults + DB for all Torn fetches and scoring.

### Notes

- New dependency: **`better-sqlite3`**. On first run the `data/` directory is created if missing; `*.sqlite` files under `data/` are gitignored.
- **`TORN_PUBLIC_API_KEYS`** in the DB replaces the file-based pool when present; delete the override (PUT `null`) to fall back to **`src/static-api-keys.js`**.

### Dependencies

- Added **better-sqlite3** (existing: express, marked, github-slugger).

---

## v2.3.4

**Release date:** April 18, 2026

### Highlights

- **Web MVC cleanup (saved exports):** row delete, bulk delete, clear-all-rows, and per-column **Update** are implemented in `web/controllers/saved-player-export-controller.js`; `web/server.js` routes stay validation and redirect only.
- **Single by-id stack:** viewer **Update** and `/api/by-id` both go through `exportPlayerByIdToSql` → `getActiveRankedPlayerByIdToSql` (documented on `src/controllers/player-stats-csv-controller.js`).

### Notes

- No change to Torn selections, scoring, or export column set; behavior matches v2.3.3 for these actions.

### Dependencies

- Unchanged (**express**, **marked**, **github-slugger**).

---

## v2.3.3

**Release date:** April 18, 2026

### Highlights

- **Saved player data upsert-by-player:** saving again for the same `playerId` now updates that player row in-place (no duplicate INSERT row) in TornAPIJS export files. `appendSqlRow(..., { upsertByPlayerId: false })` keeps the old append-only behavior.
- **Saved player data viewer actions:** each player column now includes **Update**, **Copy data**, and **Delete** controls; **Update** refreshes that player from Torn API and rewrites the same row in the same file.
- **Saved player data viewer readability:** added **Data last updated** (relative time) above **Recorded at (GMT)**; hidden duplicate field rows already shown in headers (player name / player ID) for a cleaner stats table.
- **Web UX refresh:** top navigation rebuilt (title/home left, nav center, quick search right), no horizontal scroll in desktop nav, and tighter button styling across the app.

### Notes

- Existing `.sql` files continue to work; only viewer presentation changed for header/field duplication and relative-time row.
- Per-player update in the viewer uses the same by-id export path and upsert logic as API/CLI flows, so data/columns remain aligned with `CSV_HEADERS`.

### Dependencies

- Unchanged (**express**, **marked**, **github-slugger**).

---

## v2.3.2

**Release date:** April 17, 2026

### Highlights

- **Ranked war stats (informational, not scored):** v2 `personalstats` now also requests **`rankedwarhits`** (same two-call monthly snapshot as xanax/time). New export / response fields: **`allTimeRankedWarHits`**, **`rankedWarHitsDuringLastMonth`**. **Not used in tier** or `combinedScore`.
- **Ranked wars participated (last month):** when the player has a **`factionId`**, one additional **`GET /faction/{id}?selections=rankedwars,basic`** counts ranked wars whose timeline overlaps the rolling last-month window and where **`days_in_faction`** implies the member had joined before the war ended (join estimated from `now − days_in_faction × 86400`). Field: **`rankedWarsParticipatedLastMonth`**. **Not used in tier.** Faction API returns at most the last **100** ranked wars; if the member row is missing, the count is **`null`**.
- **Web — Copy data:** success pages for **Random ranked**, **Player by ID**, and **Faction HoF** show a **Copy data** control above the formatted result block (`web/server.js`, `web/public/site.js`, `web/public/style.css`). Uses the Clipboard API with a `textarea` fallback.
- **Web — Copy data (saved player data viewer):** on `/exports/view/<file>.sql`, each transposed **player column** header includes **Copy data**, copying that row as pretty-printed text (row data embedded once in the page; same clipboard behavior as API pages).

### Notes

- Older `.sql` exports without `allTimeRankedWarHits` / `rankedWarHitsDuringLastMonth` / `rankedWarsParticipatedLastMonth` still display (blank cells); new rows include them; a row delete in the viewer rewrites to current headers.
- Per successful fetch with a faction, expect **one extra** Torn call vs v2.3.1 (faction `rankedwars,basic`); `tornApiCallsUsed` in the JSON reflects this.

### Dependencies

- Unchanged (**express**, **marked**, **github-slugger**).

---

## v2.3.1

**Release date:** April 17, 2026

### Highlights

- **Saved player data — bulk actions:** The `/exports` page gained a select-all checkbox, per-file checkboxes, **Delete checked**, and **Delete all files** (with a second "type-yes-to-confirm" prompt). Per-file card layout shows the human name, raw `.sql` badge, last-modified time and size (`web/server.js`, `web/public/style.css`, `web/public/site.js`).
- **Saved player data viewer — bulk record actions:** Inside each file viewer, a new toolbar adds select-all-records, **Delete checked records**, and **Delete all records** (`POST /exports/view/:file/delete-rows` and `/delete-all-rows`). Individual row delete is unchanged.
- **Time-score threshold tightened:** `HOURS_PER_DAY_FOR_FULL_TIME_SCORE` is now **3 h/day** (was 6 h/day) — `averageTimeScore` reaches 100% at a 3 h/day average over the last-month window. Tier weights unchanged (75% xan / 25% time).
- **Ecstasy (informational, not scored):** `exttaken` is now fetched alongside `xantaken`. Two new export / response fields — `allTimeEcstasyTaken` and `ecstasyTakenDuringLastMonth` — mirror the xanax monthly-delta pattern. **No ecstasy score**, **no tier impact**; `combinedScore` still = `0.75 × xanScore + 0.25 × averageTimeScore`.

### Fixes

- **`buildPlayerStatsCsvRow` now emits ecstasy values:** the two ecstasy columns were added to `CSV_HEADERS` but the row builder wasn't copying them from `stats`, so new INSERTs had the column names listed but `NULL` for the values. Fixed in `src/models/player-stats-csv-model.js`.

### Notes

- Older `.sql` exports without `allTimeEcstasyTaken` / `ecstasyTakenDuringLastMonth` still display (those two cells appear blank); new rows include them, and a row delete in the viewer rewrites the file to the current headers.
- Rows written by a pre-fix v2.3.1 build (column list had ecstasy but values were `NULL`) can be cleaned up by deleting those rows in the viewer and re-running the API.

### Dependencies

- Unchanged (**express**, **marked**, **github-slugger**).

---

## v2.3.0

**Release date:** March 28, 2026

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

**Release date:** March 28, 2026

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

**Release date:** March 28, 2026

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

**Release date:** March 28, 2026

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

**Release date:** March 19, 2026

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

**Release date:** March 18, 2026

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

**Release date:** March 18, 2026

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

**Release date:** March 18, 2026

- Random active player API with xanax-based tier (S/A/B/C/D).
- Single API call per try (profile + personalstats combined) to minimize Torn API usage.
- Tier thresholds: S >= 75, A >= 60, B >= 40, C >= 25, D < 25 (scores 0-100).
- Filters: active hours, ID range, max tries, period (day/month), tier (exact), has faction, has company.
- Response: playerId, name, level, xanScore, tier, faction/company names, tornApiCallsUsed, etc.
- Refactored codebase (constants, API client, utils, services) and improved error messages.
