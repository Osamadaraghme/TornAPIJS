/**
 * Run from project folder:
 *   PowerShell: $env:TORN_API_KEY="your_key"; node run-random.js
 *   CMD:        set TORN_API_KEY=your_key && node run-random.js
 */

const { getRandomPlayer } = require('./src/services/random-player.js');

const apiKey = process.env.TORN_API_KEY;
if (!apiKey) {
    console.log('Usage (PowerShell): $env:TORN_API_KEY="your_key"; node run-random.js');
    console.log('Optional params: MIN_ID MAX_ID MAX_TRIES');
    console.log('Example: $env:TORN_API_KEY="your_key"; node run-random.js 1 3000000 50');
    process.exit(1);
}

const minId = process.argv[2] ? Number(process.argv[2]) : undefined;
const maxId = process.argv[3] ? Number(process.argv[3]) : undefined;
const maxTries = process.argv[4] ? Number(process.argv[4]) : undefined;

getRandomPlayer(apiKey, { minId, maxId, maxTries })
    .then(({ id, level }) => {
        console.log(`Random player -> ID: ${id}, Level: ${level}`);
    })
    .catch((err) => {
        console.error(err?.message || err);
        process.exit(1);
    });

