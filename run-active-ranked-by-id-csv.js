/**
 * Run from project folder:
 *   PowerShell: node run-active-ranked-by-id-csv.js PLAYER_ID [SQL_PATH]
 *
 * Appends one INSERT to the .sql file (creates file with column header comments if missing).
 * Default path under ./exports/ or set `TORN_STATS_SQL` / `TORN_BY_ID_STATS_SQL`.
 */

const { exportPlayerByIdToSql } = require('./src/controllers/player-stats-export-controller.js');
const { printSuccess, printError } = require('./src/views/cli-output-view.js');

const playerId = process.argv[2];
const sqlPath = process.argv[3];

if (!playerId) {
    console.log('Usage (PowerShell): node run-active-ranked-by-id-csv.js PLAYER_ID [SQL_PATH]');
    process.exit(1);
}

exportPlayerByIdToSql(playerId, sqlPath ? { sqlPath } : {})
    .then((out) => {
        printSuccess(out);
    })
    .catch((err) => {
        printError(err);
        setTimeout(() => process.exit(1), 100);
    });

