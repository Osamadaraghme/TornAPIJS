# TornAPIJS

Simple JS helpers for the [Torn City](https://www.torn.com) API — find recruitment candidates (random active players) and score them.

### Project structure (refactored)

- **`src/constants.js`** — API URL, error messages, fatal error codes.
- **`src/api/torn-client.js`** — Low-level Torn API (fetch user, faction, company); no business logic.
- **`src/utils/`** — Helpers: `extractors.js` (profile/stats fields), `scoring.js` (xanax score & tier), `errors.js` (Torn errors & “no player found” messages), `helpers.js` (e.g. randomIntInclusive).
- **`src/services/`** — Use cases: `active-ranked-player.js`. Each uses the API client and utils.
- **`run-active-ranked.js`** — CLI entry point.
- Legacy re-exports were removed for the player-level and random-player proof-of-concepts.

---

## How to run (Node.js)

1. Install [Node.js](https://nodejs.org/) (v18+).
2. Get a **public** API key from [Torn Preferences → API](https://www.torn.com/preferences.php#tab=api).

---

## Random active player + tier scoring (S/A/B/C/D)

**Files:** `src/services/active-ranked-player.js`, `run-active-ranked.js`

Returns a random player who has been active in the last X hours. Response includes:
- **playerId**, **name**, **level**
- **xanScore** (0–100, based on xanax usage)
- **tier** (S/A/B/C/D)
- **hasFaction** (true/false) — whether the player is in a faction
- **hasCompany** (true/false) — whether the player has a job/company
- **factionName** (string or null) — name of the player's faction, if any
- **companyName** (string or null) — name of the player's company/job, if any
- **hoursSinceLastAction**, xanax averages, **statsAvailable**, **periodUsed**
- **tornApiCallsUsed** (number) — how many Torn API requests were made for this run (useful for staying under the 100/min limit)

Run (PowerShell):

```powershell
$env:TORN_API_KEY="your_16_char_api_key"; node run-active-ranked.js
```

Optional args (all positional):

```text
ACTIVE_HOURS  MIN_ID  MAX_ID  MAX_TRIES  PERIOD(day|month)  TIER  HAS_FACTION  HAS_COMPANY  [MIN_LEVEL]
```

- **ACTIVE_HOURS**: how many hours back to consider someone “active”.  
  Example: `24` = active in the last 24 hours.
- **MIN_ID**: lowest user ID to try when picking random players (usually `1`).
- **MAX_ID**: highest user ID to try (e.g. `3000000`).
- **MAX_TRIES**: maximum random attempts before giving up (e.g. `120`).  
  Higher value = more time trying to find a matching player.
- **PERIOD**: `"day"` or `"month"` — controls how xanax usage is normalised.
- **TIER**: `"S"|"A"|"B"|"C"|"D"|"ALL"` (not case-sensitive). Returns a player at **this tier or higher** (e.g. `C` = C, B, A, or S; `S` = S only). `"ALL"` = ignore tier.
- **HAS_FACTION**: `Y` = only in a faction, `N` = only factionless, `ANY` or omit = don't care (case-insensitive).
- **HAS_COMPANY**: `Y` = only with a job/company, `N` = only without, `ANY` or omit = don't care (case-insensitive).
- **MIN_LEVEL** (optional): only return players with level ≥ this (e.g. `20`). Omit for no minimum.

```powershell
$env:TORN_API_KEY="your_16_char_api_key"; node run-active-ranked.js 24 1 3000000 120 month ALL ANY ANY
```

### Tier filter

TIER means **this tier or higher**: e.g. `C` returns a player who is C, B, A, or S; `B` returns B, A, or S; `S` returns S only.

```powershell
# Any active player, ignore tiers
$env:TORN_API_KEY="your_16_char_api_key"; node run-active-ranked.js 24 1 3000000 120 month ALL

# S-tier only (highest)
$env:TORN_API_KEY="your_16_char_api_key"; node run-active-ranked.js 24 1 3000000 120 month s

# A-tier or higher (A or S)
$env:TORN_API_KEY="your_16_char_api_key"; node run-active-ranked.js 24 1 3000000 120 month A

# C-tier or higher (C, B, A, or S)
$env:TORN_API_KEY="your_16_char_api_key"; node run-active-ranked.js 24 1 3000000 120 month C
```

### Faction and company filters

```powershell
# Only players in a faction
$env:TORN_API_KEY="your_key"; node run-active-ranked.js 24 1 3000000 120 month ALL Y ANY

# Only factionless players
$env:TORN_API_KEY="your_key"; node run-active-ranked.js 24 1 3000000 120 month ALL N ANY

# Only players with a company/job
$env:TORN_API_KEY="your_key"; node run-active-ranked.js 24 1 3000000 120 month ALL ANY Y

# Only players without a company
$env:TORN_API_KEY="your_key"; node run-active-ranked.js 24 1 3000000 120 month ALL ANY N

# Factionless, no company
$env:TORN_API_KEY="your_key"; node run-active-ranked.js 24 1 3000000 120 month ALL N N
```

### Recruitment use case

The API is well-suited to finding **recruitment candidates**: active players who meet your tier/level/faction criteria.

**Suggested parameters:**

| Goal | Example |
|------|--------|
| Factionless, so you can recruit them | `HAS_FACTION=N` |
| Minimum engagement (tier C or better) | `TIER=C` |
| Only players level 20+ | Add `MIN_LEVEL=20` as 10th arg |
| Active in last 12–24h | `ACTIVE_HOURS=24` (or `12`) |
| More candidates to choose from | Increase `MAX_TRIES` (e.g. `200`) |

**Example — factionless, tier B or higher, level 25+, active in 24h:**

```powershell
$env:TORN_API_KEY="your_key"; node run-active-ranked.js 24 1 3000000 200 month B N ANY 25
```

**Tips:**

- **Rate limit:** Torn allows 100 API calls/minute. Each “try” is 1 call; a match adds 0–2 for faction/company names. Keep `MAX_TRIES` &lt; 100 per run or add a short delay between runs.
- **Narrow ID range:** Use a higher `MIN_ID` (e.g. `100000`) to skip very old accounts if you prefer.
- **Programmatic use:** Require `./src/services/active-ranked-player.js` and call `getRandomActiveRankedPlayer(apiKey, { minLevel: 20, tier: 'B', hasFaction: 'N', ... })` to integrate into your own recruitment script.

### API call count

Every successful response includes **tornApiCallsUsed**: the number of requests made to Torn’s API for that run. To minimize calls, each try uses one combined user request (profile + personalstats). Typical run: each extra “try” (random ID checked) adds 1 call per try; only the chosen player gets 0–2 extra calls for faction/company names. Torn allows 100 calls per minute per user, so you can gauge how often you can run the script.

### Errors

The script returns clear errors instead of a single generic message:

- **No API key** — `Torn API key is required.`
- **Invalid key / rate limit / IP block / key paused** — If Torn returns a fatal error (empty key, wrong key, too many requests, IP block, API disabled, key in jail, key paused), the script throws immediately with Torn’s error message so you don’t burn through all tries.
- **Every request failed** — e.g. `Every Torn API request failed (120 attempts). Check your API key...`
- **No one active** — e.g. `No players were active in the last 24 hours after 50 profile checks (50 API calls). Try increasing activeWithinHours or maxTries.`
- **No match for tier** — e.g. `No active player matched your tier filter (S) after 30 candidates (65 API calls). Try a different tier or increase maxTries.`
- **No match for filters** — e.g. `Could not find an active player matching your filters (last 24h, 120 tries, 122 API calls). Try increasing maxTries or relaxing tier/faction/company filters.`

See [Torn API docs](https://www.torn.com/api.html) for full error codes (e.g. 2 = wrong key, 5 = rate limit, 7 = private data).

Note: If Torn API does not allow `personalstats` for the chosen player, scores will be `0` and the player will rank `D` with `statsAvailable: false`.

 
Note: the player-level and random-player proof-of-concepts were removed. Use `run-active-ranked.js` for recruitment scoring.
