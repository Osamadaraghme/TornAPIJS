/**
 * Run from project folder:
 *   PowerShell:
 *   $env:TORN_API_KEY="your_key"; node run-active-ranked-by-id-csv.js PLAYER_ID [CSV_PATH]
 *
 * Example:
 *   $env:TORN_API_KEY="your_key"; node run-active-ranked-by-id-csv.js 3961724 "./player-stats.csv"
 */

const { writeActiveRankedPlayerByIdToCsv } = require('./src/services/active-ranked-player-by-id-csv.js');

const apiKey = process.env.TORN_API_KEY;
if (!apiKey) {
    console.log('Usage (PowerShell): $env:TORN_API_KEY="your_key"; node run-active-ranked-by-id-csv.js PLAYER_ID [CSV_PATH]');
    process.exit(1);
}

const playerId = process.argv[2];
const csvPath = process.argv[3] || 'player-stats.csv';

if (!playerId) {
    console.log('Usage (PowerShell): $env:TORN_API_KEY="your_key"; node run-active-ranked-by-id-csv.js PLAYER_ID [CSV_PATH]');
    process.exit(1);
}

writeActiveRankedPlayerByIdToCsv(playerId, csvPath)
    .then((out) => {
        console.log(JSON.stringify({
            csvPath: out.csvPath,
            fileCreated: out.fileCreated,
            rowAdded: out.rowAdded,
            result: out.playerStats,
        }, null, 2));
    })
    .catch((err) => {
        console.error(err?.message || err);
        setTimeout(() => process.exit(1), 100);
    });

