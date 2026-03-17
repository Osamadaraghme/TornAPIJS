# TornAPIJS

Simple JS helpers for the [Torn City](https://www.torn.com) API — get a player's level by ID.

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

**Files:** `src/active-ranked-random-player.js`, `run-active-ranked.js`

Returns a random player who has been active in the last X hours. Response includes:
- **playerId**, **name**, **level**
- **xanScore** (0–100, based on xanax usage)
- **tier** (S/A/B/C/D)
- **hasFaction** (true/false) — whether the player is in a faction
- **hasCompany** (true/false) — whether the player has a job/company
- **factionName** (string or null) — name of the player's faction, if any
- **companyName** (string or null) — name of the player's company/job, if any
- **hoursSinceLastAction**, xanax averages, **statsAvailable**, **periodUsed**

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
