/**
 * Service: write active-ranked player-by-id stats to CSV.
 *
 * Uses the existing by-id stats API, then writes one CSV row:
 * - If file exists: append row
 * - If file does not exist: create with header, then append row
 */

const fs = require('fs/promises');
const path = require('path');
const { getActiveRankedPlayerById } = require('./active-ranked-player-by-id.js');

const CSV_HEADERS = [
    'collectedAtIso',
    'playerId',
    'name',
    'level',
    'ageDays',
    'ageMonths',
    'ageYears',
    'hasFaction',
    'hasCompany',
    'factionName',
    'companyName',
    'hoursSinceLastAction',
    'xanScore',
    'tier',
    'avgXanaxPerDay',
    'totalXanaxAllTime',
    'totalXanaxLastMonth',
    'avgLastMonth',
    'statsAvailable',
    'periodUsed',
    'periodIsWindowed',
    'xanaxMode',
    'tornApiCallsUsed',
];

/**
 * Escape a single CSV value according to RFC-style CSV rules.
 * @param {unknown} value
 * @returns {string}
 */
function csvEscape(value) {
    if (value == null) return '';
    const s = String(value);
    if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
}

/**
 * Convert a stats object to one CSV row string (without trailing newline).
 * @param {object} stats
 * @returns {string}
 */
function toCsvRow(stats) {
    const row = {
        collectedAtIso: new Date().toISOString(),
        ...stats,
    };
    return CSV_HEADERS.map((h) => csvEscape(row[h])).join(',');
}

/**
 * Write one player stats record to CSV.
 *
 * @param {number|string} playerId
 * @param {string} [csvFilePath='player-stats.csv'] absolute or relative path
 * @returns {Promise<{ csvPath: string, fileCreated: boolean, rowAdded: boolean, playerStats: object }>}
 */
async function writeActiveRankedPlayerByIdToCsv(playerId, csvFilePath = 'player-stats.csv') {
    const stats = await getActiveRankedPlayerById(playerId);

    const resolvedPath = path.resolve(csvFilePath);
    const dir = path.dirname(resolvedPath);
    await fs.mkdir(dir, { recursive: true });

    let exists = true;
    try {
        await fs.access(resolvedPath);
    } catch {
        exists = false;
    }

    if (!exists) {
        await fs.writeFile(resolvedPath, `${CSV_HEADERS.join(',')}\n`, 'utf8');
    }

    const line = `${toCsvRow(stats)}\n`;
    await fs.appendFile(resolvedPath, line, 'utf8');

    return {
        csvPath: resolvedPath,
        fileCreated: !exists,
        rowAdded: true,
        playerStats: stats,
    };
}

module.exports = {
    writeActiveRankedPlayerByIdToCsv,
};

