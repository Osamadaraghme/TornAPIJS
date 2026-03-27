/**
 * Same random active-ranked player API, but appends the matched player
 * as one row in CSV (create file with header if missing, append otherwise).
 */

const { getRandomActiveRankedPlayer } = require('./random-active-ranked-player.js');
const { appendCsvRow } = require('../utils/csv-append.js');
const { DEFAULT_RANDOM_STATS_CSV_PATH } = require('../constants.js');
const { CSV_HEADERS, buildPlayerStatsCsvRow } = require('../models/player-stats-csv-model.js');

/**
 * Fetch one random active ranked player and append one CSV row.
 * @param {string|string[]|undefined} apiKey - Optional key override/key pool
 * @param {object} [options]
 * @param {string} [options.csvPath] - Output path (default: random-active-ranked-player-stats.csv)
 * @returns {Promise<{ path: string, created: boolean, data: object }>}
 */
async function getRandomActiveRankedPlayerToCsv(apiKey, options = {}) {
    const csvPath = options.csvPath
        ?? process.env.TORN_RANDOM_STATS_CSV
        ?? process.env.TORN_STATS_CSV
        ?? DEFAULT_RANDOM_STATS_CSV_PATH;

    const stats = await getRandomActiveRankedPlayer(apiKey, options);

    const row = buildPlayerStatsCsvRow(stats);

    const { path: resolvedPath, created } = appendCsvRow(csvPath, CSV_HEADERS, row);
    return { path: resolvedPath, created, data: stats };
}

module.exports = {
    getRandomActiveRankedPlayerToCsv,
};

