/**
 * Run from project folder:
 *   PowerShell: node run-active-ranked-by-id-csv.js PLAYER_ID [CSV_PATH]
 *
 * Appends one row to the CSV (creates file with header if it does not exist).
 * Default CSV path: `player-stats.csv` in the current directory, or set `TORN_STATS_CSV`.
 */

const { exportPlayerByIdToCsv } = require('./src/controllers/player-stats-csv-controller.js');
const { printSuccess, printError } = require('./src/views/cli-output-view.js');

const playerId = process.argv[2];
const csvPath = process.argv[3];

if (!playerId) {
    console.log('Usage (PowerShell): node run-active-ranked-by-id-csv.js PLAYER_ID [CSV_PATH]');
    process.exit(1);
}

exportPlayerByIdToCsv(playerId, csvPath ? { csvPath } : {})
    .then((out) => {
        printSuccess(out);
    })
    .catch((err) => {
        printError(err);
        setTimeout(() => process.exit(1), 100);
    });

