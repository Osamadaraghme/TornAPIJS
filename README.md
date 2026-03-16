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
2. Get your API key from [Torn Preferences → API](https://www.torn.com/preferences.php#tab=api).
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
