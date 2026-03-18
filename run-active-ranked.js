/**
 * Run from project folder:
 *   PowerShell: $env:TORN_API_KEY="your_key"; node run-active-ranked.js
 *
 * Optional args: ACTIVE_HOURS MIN_ID MAX_ID MAX_TRIES PERIOD TIER HAS_FACTION HAS_COMPANY [MIN_LEVEL]
 * Example:
 *   $env:TORN_API_KEY="your_key"; node run-active-ranked.js 24 1 3000000 120 month ALL ANY ANY
 *   $env:TORN_API_KEY="your_key"; node run-active-ranked.js 24 1 3000000 120 month B N ANY 20
 */

const { getRandomActiveRankedPlayer } = require('./src/services/random-active-ranked-player.js');

const apiKey = process.env.TORN_API_KEY;
if (!apiKey) {
    console.log('Usage (PowerShell): $env:TORN_API_KEY="your_key"; node run-active-ranked.js');
    console.log('Optional args: ACTIVE_HOURS MIN_ID MAX_ID MAX_TRIES PERIOD TIER HAS_FACTION HAS_COMPANY [MIN_LEVEL]');
    process.exit(1);
}

const activeWithinHours = process.argv[2] ? Number(process.argv[2]) : undefined;
const minId = process.argv[3] ? Number(process.argv[3]) : undefined;
const maxId = process.argv[4] ? Number(process.argv[4]) : undefined;
const maxTries = process.argv[5] ? Number(process.argv[5]) : undefined;
const period = process.argv[6] === 'month' ? 'month' : 'day';
const tier = process.argv[7] || 'ALL';
const hasFaction = process.argv[8] || 'ANY';
const hasCompany = process.argv[9] || 'ANY';
const minLevel = process.argv[10] ? Number(process.argv[10]) : undefined;

getRandomActiveRankedPlayer(apiKey, { activeWithinHours, minId, maxId, maxTries, period, tier, hasFaction, hasCompany, minLevel })
    .then((out) => {
        console.log(JSON.stringify(out, null, 2));
    })
    .catch((err) => {
        console.error(err?.message || err);
        // Brief delay before exit so Node can close in-flight fetch handles (avoids libuv assertion on Windows).
        setTimeout(() => process.exit(1), 100);
    });
