/**
 * Web-layer orchestration for mutating saved TornAPIJS player `.sql` exports.
 * Express routes in `web/server.js` stay thin; parse/write and Torn refresh live here.
 *
 * Refreshing a row always uses `exportPlayerByIdToSql` from `src/controllers/player-stats-csv-controller.js`
 * (same stack as `/api/by-id` and CLI by-id).
 */

const fsp = require('fs').promises;

const { parsePlayerStatsSql } = require('../lib/parse-player-stats-sql.js');
const {
    writeSqlExportFile,
    pickRowForHeaders,
    DEFAULT_TABLE_NAME,
} = require('../../src/utils/sql-append.js');
const { CSV_HEADERS } = require('../../src/models/player-stats-csv-model.js');
const { exportPlayerByIdToSql } = require('../../src/controllers/player-stats-csv-controller.js');

/**
 * Remove one row by index and rewrite the file to current headers.
 * @returns {{ ok: true } | { ok: false, code: 'bad_index' }}
 */
async function deleteExportedPlayerRowByIndex(fullPath, rowIndex) {
    if (!Number.isInteger(rowIndex) || rowIndex < 0) {
        return { ok: false, code: 'bad_index' };
    }
    const text = await fsp.readFile(fullPath, 'utf8');
    const parsed = parsePlayerStatsSql(text);
    if (!parsed || rowIndex >= parsed.rows.length) {
        return { ok: false, code: 'bad_index' };
    }
    const nextRows = parsed.rows.filter((_, i) => i !== rowIndex);
    const normalized = nextRows.map((r) => pickRowForHeaders(CSV_HEADERS, r));
    writeSqlExportFile(fullPath, CSV_HEADERS, normalized, { tableName: DEFAULT_TABLE_NAME });
    return { ok: true };
}

/**
 * Remove every listed row index and rewrite the file.
 * @param {Iterable<number|string>} rawIndices
 * @returns {{ ok: true, deletedCount: number } | { ok: false, code: 'no_selection' | 'bad_parse' }}
 */
async function deleteExportedPlayerRowsByIndices(fullPath, rawIndices) {
    const removeSet = new Set();
    for (const v of rawIndices) {
        const n = Number(v);
        if (Number.isInteger(n) && n >= 0) removeSet.add(n);
    }
    if (removeSet.size === 0) {
        return { ok: false, code: 'no_selection' };
    }
    const text = await fsp.readFile(fullPath, 'utf8');
    const parsed = parsePlayerStatsSql(text);
    if (!parsed) {
        return { ok: false, code: 'bad_parse' };
    }
    const nextRows = parsed.rows.filter((_, i) => !removeSet.has(i));
    const normalized = nextRows.map((r) => pickRowForHeaders(CSV_HEADERS, r));
    writeSqlExportFile(fullPath, CSV_HEADERS, normalized, { tableName: DEFAULT_TABLE_NAME });
    return { ok: true, deletedCount: removeSet.size };
}

/** Truncate the file to zero data rows (header block preserved by writer). */
function clearAllExportedPlayerRows(fullPath) {
    writeSqlExportFile(fullPath, CSV_HEADERS, [], { tableName: DEFAULT_TABLE_NAME });
}

/**
 * Re-fetch one player from Torn and upsert into the same file (by playerId).
 * @returns {{ ok: true, playerId: number } | { ok: false, code: string, message?: string, rowIndex?: number }}
 */
async function refreshExportedPlayerRowByIndex(fullPath, rowIndex) {
    if (!Number.isInteger(rowIndex) || rowIndex < 0) {
        return { ok: false, code: 'bad_index' };
    }
    const text = await fsp.readFile(fullPath, 'utf8');
    const parsed = parsePlayerStatsSql(text);
    if (!parsed || rowIndex >= parsed.rows.length) {
        return { ok: false, code: 'bad_index' };
    }
    const pNum = Number(parsed.rows[rowIndex]?.playerId);
    if (!Number.isFinite(pNum) || pNum <= 0) {
        return {
            ok: false,
            code: 'bad_player_id',
            rowIndex,
            message: `Row ${rowIndex + 1} has no valid playerId`,
        };
    }
    try {
        await exportPlayerByIdToSql(pNum, { sqlPath: fullPath });
        return { ok: true, playerId: Math.floor(pNum) };
    } catch (err) {
        const message = err?.message ? String(err.message) : String(err);
        return { ok: false, code: 'api_error', message };
    }
}

module.exports = {
    deleteExportedPlayerRowByIndex,
    deleteExportedPlayerRowsByIndices,
    clearAllExportedPlayerRows,
    refreshExportedPlayerRowByIndex,
};
