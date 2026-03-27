/**
 * Same player stats as `getActiveRankedPlayerById`, but appends one row to a CSV file
 * instead of returning JSON for display. If the file does not exist, it is created with a header row.
 */

const { getActiveRankedPlayerById } = require('./active-ranked-player-by-id.js');
const { appendCsvRow } = require('../utils/csv-append.js');
const { DEFAULT_BY_ID_STATS_CSV_PATH } = require('../constants.js');
const { CSV_HEADERS, buildPlayerStatsCsvRow } = require('../models/player-stats-csv-model.js');

/**
 * Fetch player stats and append them as one CSV row.
 * @param {number|string} playerId - Torn user ID
 * @param {object} [options]
 * @param {string} [options.csvPath] - Output CSV path (default: `active-ranked-player-by-id-stats.csv`)
 * @returns {Promise<{ path: string, created: boolean, data: object }>}
 */
async function getActiveRankedPlayerByIdToCsv(playerId, options = {}) {
    const csvPath = options.csvPath
        ?? process.env.TORN_BY_ID_STATS_CSV
        ?? process.env.TORN_STATS_CSV
        ?? DEFAULT_BY_ID_STATS_CSV_PATH;

    const stats = await getActiveRankedPlayerById(playerId);

    const row = buildPlayerStatsCsvRow(stats);

    const { path: resolvedPath, created } = appendCsvRow(csvPath, CSV_HEADERS, row);

    return {
        path: resolvedPath,
        created,
        data: stats,
    };
}

module.exports = {
    getActiveRankedPlayerByIdToCsv,
    CSV_HEADERS,
};
