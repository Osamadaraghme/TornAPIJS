# TornAPIJS

Simple JS helpers for the [Torn City](https://www.torn.com) API — get a player's level by ID.

### Project structure (refactored)

- **`src/constants.js`** — API URL, error messages, fatal error codes.
- **`src/api/torn-client.js`** — Low-level Torn API (fetch user, faction, company); no business logic.
- **`src/utils/`** — Helpers: `extractors.js` (profile/stats fields), `scoring.js` (xanax score & tier), `errors.js` (Torn errors & “no player found” messages), `helpers.js` (e.g. randomIntInclusive).
- **`src/services/`** — Use cases: `player-level.js`, `random-player.js`, `active-ranked-player.js`. Each uses the API client and utils.
- **`run.js`**, **`run-random.js`**, **`run-active-ranked.js`** — CLI entry points (require the services above).
- **`src/torn-api.js`**, **`src/random-player.js`**, **`src/active-ranked-random-player.js`** — Legacy re-exports; prefer `src/services/*` or `src/index.js`.

---

## How to run

### Option A: In the browser on Torn (Tampermonkey)

1. Install [Tampermonkey](https://www.tampermonkey.net/) in Chrome/Firefox/Edge.
2. Open Tampermonkey → **Create a new script**.
3. Paste in the contents of `scripts/player-level-api.user.js` and save.
4. Go to [torn.com](https://www.torn.com), log in, then in the console run:  
   `setTornApiKey("your_16_char_api_key");`
5. Use the **Player Level** panel (bottom-right) or in the console:  
   `await getPlayerLevel(12345)`

### Option B: From the command line (Node.js)

1. Install [Node.js](https://nodejs.org/) (v18+).
2. Get a **public** API key from [Torn Preferences → API](https://www.torn.com/preferences.php#tab=api).
3. In the project folder, run:

   **Windows (PowerShell):**
   ```powershell
   $env:TORN_API_KEY="your_16_char_api_key"; node run.js 12345
   ```

   **Windows (CMD):**
   ```cmd
   set TORN_API_KEY=your_16_char_api_key
   node run.js 12345
   ```

   **macOS/Linux:**
   ```bash
   TORN_API_KEY=your_16_char_api_key node run.js 12345
   ```

   Replace `12345` with any Torn player ID. Omit the ID to test with player ID `1`.

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
ACTIVE_HOURS  MIN_ID  MAX_ID  MAX_TRIES  PERIOD(day|month)  TIER  HAS_FACTION  HAS_COMPANY
```

- **ACTIVE_HOURS**: how many hours back to consider someone “active”.  
  Example: `24` = active in the last 24 hours.
- **MIN_ID**: lowest user ID to try when picking random players (usually `1`).
- **MAX_ID**: highest user ID to try (e.g. `3000000`).
- **MAX_TRIES**: maximum random attempts before giving up (e.g. `120`).  
  Higher value = more time trying to find a matching player.
- **PERIOD**: `"day"` or `"month"` — controls how xanax usage is normalised.
- **TIER**: `"S"|"A"|"B"|"C"|"D"|"ALL"` (not case-sensitive). `"ALL"` = ignore tier.
- **HAS_FACTION**: `Y` = only in a faction, `N` = only factionless, `ANY` or omit = don't care (case-insensitive).
- **HAS_COMPANY**: `Y` = only with a job/company, `N` = only without, `ANY` or omit = don't care (case-insensitive).

```powershell
$env:TORN_API_KEY="your_16_char_api_key"; node run-active-ranked.js 24 1 3000000 120 month ALL ANY ANY
```

### Tier filter

```powershell
# Any active player, ignore tiers
$env:TORN_API_KEY="your_16_char_api_key"; node run-active-ranked.js 24 1 3000000 120 month ALL

# Only S-tier players
$env:TORN_API_KEY="your_16_char_api_key"; node run-active-ranked.js 24 1 3000000 120 month s

# Only A-tier players
$env:TORN_API_KEY="your_16_char_api_key"; node run-active-ranked.js 24 1 3000000 120 month A
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

### API call count

Every successful response includes **tornApiCallsUsed**: the number of requests made to Torn’s API for that run. Typical runs use about 2–4 calls when a player is found quickly; each extra “try” (random ID checked) adds 1–2 calls. Torn allows 100 calls per minute per user, so you can gauge how often you can run the script.

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

---

## 1. Tampermonkey script (on Torn website)

**File:** `scripts/player-level-api.user.js`

- Install [Tampermonkey](https://www.tampermonkey.net/), then add this as a new userscript.
- Runs on `https://www.torn.com/*`.
- Uses the official Torn API: `https://api.torn.com/user/:ID?selections=profile&key=...`

### Setup

1. Get an API key: [Torn Preferences → API](https://www.torn.com/preferences.php#tab=api).
2. On any Torn page, open the browser console and run:
   ```js
   setTornApiKey("your_16_character_api_key");
   ```
   (Key is stored locally by Tampermonkey only.)

### Usage

- **UI:** A small “Player Level” panel appears at the bottom-right. Enter a player ID and click “Get Level”.
- **Console:**
  ```js
  getPlayerLevel(12345);        // Promise<number|null>
  await getPlayerLevel(12345);  // e.g. 42
  ```

## 2. Standalone JS module (Node or browser)

**File:** `src/torn-api.js`

Use from Node or any environment where `fetch` is available.

```js
const { getPlayerLevel } = require('./src/torn-api.js');

const level = await getPlayerLevel(12345, 'your_api_key');
console.log(level); // e.g. 42
```

Or from browser (no Tampermonkey):

```html
<script type="module">
  import { getPlayerLevel } from './src/torn-api.js';
  const level = await getPlayerLevel(12345, 'YOUR_API_KEY');
  console.log(level);
</script>
```

Note: The Torn API requires an API key and allows ~100 requests per minute per user.
