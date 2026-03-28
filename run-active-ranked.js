/**
 * Run from project folder:
 *   PowerShell: node run-active-ranked.js
 *
 * Optional args: ACTIVE_HOURS MIN_ID MAX_ID MAX_TRIES PERIOD TIER HAS_FACTION HAS_COMPANY [MIN_LEVEL] [SQL_PATH]
 * (PERIOD is ignored for scoring; service always uses monthly xanax delta — pass `month` to match examples.)
 * Example:
 *   node run-active-ranked.js 24 1 3000000 120 month ALL ANY ANY
 *   node run-active-ranked.js 24 1 3000000 120 month B N ANY 20
 */

const { exportRandomActivePlayerToSql } = require('./src/controllers/player-stats-csv-controller.js');
const { printSuccess, printError } = require('./src/views/cli-output-view.js');

const apiKey = process.env.TORN_API_KEY; // optional override; static pool is used when unset

const activeWithinHours = process.argv[2] ? Number(process.argv[2]) : undefined;
const minId = process.argv[3] ? Number(process.argv[3]) : undefined;
const maxId = process.argv[4] ? Number(process.argv[4]) : undefined;
const maxTries = process.argv[5] ? Number(process.argv[5]) : undefined;
const period = process.argv[6] === 'month' ? 'month' : 'day';
const tier = process.argv[7] || 'ALL';
const hasFaction = process.argv[8] || 'ANY';
const hasCompany = process.argv[9] || 'ANY';
const minLevel = process.argv[10] ? Number(process.argv[10]) : undefined;
const sqlPath = process.argv[11];

exportRandomActivePlayerToSql(apiKey, {
    activeWithinHours,
    minId,
    maxId,
    maxTries,
    period,
    tier,
    hasFaction,
    hasCompany,
    minLevel,
    ...(sqlPath ? { sqlPath } : {}),
})
    .then((out) => {
        printSuccess(out);
    })
    .catch((err) => {
        printError(err);
        // Brief delay before exit so Node can close in-flight fetch handles (avoids libuv assertion on Windows).
        setTimeout(() => process.exit(1), 100);
    });

