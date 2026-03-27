/**
 * Run from project folder:
 *   PowerShell:
 *     node run-faction-hof-rank-csv.js HOF_RANK [CSV_PATH] [MAX_PLAYERS]
 *     node run-faction-hof-rank-csv.js HOF_RANK MAX_PLAYERS
 *
 * Finds the faction at the requested Hall-of-Fame rank, fetches member player stats,
 * and appends one CSV row per member.
 */

const { exportFactionByHofRankToCsv } = require('./src/controllers/player-stats-csv-controller.js');
const { printSuccess, printError } = require('./src/views/cli-output-view.js');

function asPositiveInt(value) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

const hofRank = process.argv[2];
const arg3 = process.argv[3];
const arg4 = process.argv[4];

if (!hofRank) {
    console.log('Usage (PowerShell): node run-faction-hof-rank-csv.js HOF_RANK [CSV_PATH] [MAX_PLAYERS]');
    console.log('Or:                  node run-faction-hof-rank-csv.js HOF_RANK MAX_PLAYERS');
    process.exit(1);
}

const options = {};
if (arg4 != null) {
    // Full format: HOF_RANK CSV_PATH MAX_PLAYERS
    if (arg3) options.csvPath = arg3;
    const maxPlayers = asPositiveInt(arg4);
    if (maxPlayers != null) options.maxPlayers = maxPlayers;
} else if (arg3 != null) {
    // Short format: HOF_RANK MAX_PLAYERS OR HOF_RANK CSV_PATH
    const shortMaxPlayers = asPositiveInt(arg3);
    if (shortMaxPlayers != null) {
        options.maxPlayers = shortMaxPlayers;
    } else {
        options.csvPath = arg3;
    }
}

exportFactionByHofRankToCsv(hofRank, options)
    .then((out) => {
        printSuccess(out);
    })
    .catch((err) => {
        printError(err);
        setTimeout(() => process.exit(1), 100);
    });

