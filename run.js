/**
 * Run from project folder: node run.js [playerId]
 * Set your API key: set TORN_API_KEY=your_key (Windows) or TORN_API_KEY=your_key node run.js [playerId] (any OS)
 */
const { getPlayerLevel } = require('./src/torn-api.js');

const playerId = process.argv[2] || '1';
const apiKey = process.env.TORN_API_KEY;

if (!apiKey) {
    console.log('Usage: set TORN_API_KEY=your_key then run: node run.js [playerId]');
    console.log('Example: set TORN_API_KEY=abc123... && node run.js 12345');
    process.exit(1);
}

getPlayerLevel(playerId, apiKey)
    .then(level => {
        if (level != null) console.log('Level:', level);
        else console.log('Could not get level (invalid ID or API error).');
    })
    .catch(err => {
        console.error(err);
        process.exit(1);
    });