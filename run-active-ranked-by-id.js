/**
 * Run from project folder:
 *   PowerShell: $env:TORN_API_KEY="your_key"; node run-active-ranked-by-id.js PLAYER_ID
 *
 * Period selection:
 *   Set `TORN_SCORE_PERIOD=day` to score using per-day normalization.
 *   Default is `month`.
 */

const { getActiveRankedPlayerById } = require('./src/services/active-ranked-player-by-id.js');

const apiKey = process.env.TORN_API_KEY;
if (!apiKey) {
    console.log('Usage (PowerShell): $env:TORN_API_KEY="your_key"; node run-active-ranked-by-id.js PLAYER_ID');
    process.exit(1);
}

const playerId = process.argv[2];

if (!playerId) {
    console.log('Usage (PowerShell): $env:TORN_API_KEY="your_key"; node run-active-ranked-by-id.js PLAYER_ID');
    process.exit(1);
}

getActiveRankedPlayerById(playerId)
    .then((out) => {
        console.log(JSON.stringify(out, null, 2));
    })
    .catch((err) => {
        console.error(err?.message || err);
        // Brief delay before exit so Node can close in-flight fetch handles (avoids libuv assertion on Windows).
        setTimeout(() => process.exit(1), 100);
    });

