/**
 * Append one INSERT row to a .sql file. New files start with a header comment
 * block listing column names (same order as the model headers), then INSERTs.
 * String values are HTML-entity decoded (Torn often returns &#039; etc.).
 * INSERT statements are multi-line for readability.
 */

const fs = require('fs');
const path = require('path');

const { parsePlayerStatsSql } = require(path.join(__dirname, '..', '..', 'web', 'lib', 'parse-player-stats-sql.js'));

const DEFAULT_TABLE_NAME = 'player_stats';

const NAMED_ENTITIES = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' ',
};

function isWindowsLockError(err) {
    return err?.code === 'EBUSY' || err?.code === 'EPERM';
}

function sleepMs(ms) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** Decode common HTML entities so exports show readable apostrophes etc. */
function decodeHtmlEntities(str) {
    if (typeof str !== 'string') return str;
    let s = str;
    s = s.replace(/&#x([0-9a-fA-F]+);/g, (full, hex) => {
        const cp = parseInt(hex, 16);
        return Number.isFinite(cp) && cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : full;
    });
    s = s.replace(/&#(\d{1,7});/g, (full, dec) => {
        const cp = parseInt(dec, 10);
        return Number.isFinite(cp) && cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : full;
    });
    s = s.replace(/&([a-zA-Z][a-zA-Z0-9]*);/g, (full, name) => {
        const v = NAMED_ENTITIES[name.toLowerCase()];
        return v !== undefined ? v : full;
    });
    return s;
}

/** SQL literal for VALUES (...): NULL, numbers, booleans, quoted strings. */
function sqlLiteral(value) {
    if (value === null || value === undefined) return 'NULL';
    if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) return 'NULL';
        return String(value);
    }
    const s = decodeHtmlEntities(String(value));
    return `'${s.replace(/'/g, "''")}'`;
}

function quoteIdent(name) {
    return `"${String(name).replace(/"/g, '""')}"`;
}

function buildHeaderBlock(tableName, headers) {
    const list = headers.join(', ');
    return [
        `-- TornAPIJS export`,
        `-- table: ${tableName}`,
        `-- columns: ${list}`,
        '',
    ].join('\n');
}

function buildSentinelLine(tableName, headers) {
    return `-- TornAPIJS:${tableName}:${headers.join(',')}`;
}

function buildInsertBlock(tableName, headers, row) {
    const colLines = headers.map((h) => `    ${quoteIdent(h)}`).join(',\n');
    const valLines = headers.map((h) => `    ${sqlLiteral(row[h])}`).join(',\n');
    return [
        `INSERT INTO ${quoteIdent(tableName)} (`,
        `${colLines}`,
        `)`,
        `VALUES (`,
        `${valLines}`,
        `);`,
        '',
    ].join('\n');
}

/** Build row object containing only `headers` keys (missing → null). */
function pickRowForHeaders(headers, row) {
    const o = {};
    for (const h of headers) {
        o[h] = Object.prototype.hasOwnProperty.call(row, h) ? row[h] : null;
    }
    return o;
}

function samePlayerId(a, b) {
    if (a == null || b == null) return false;
    const na = Number(a);
    const nb = Number(b);
    if (Number.isFinite(na) && Number.isFinite(nb)) return na === nb;
    return String(a) === String(b);
}

/**
 * Overwrite export file with sentinel, header comments, and INSERTs (0+ rows).
 * @param {string} filePath
 * @param {string[]} headers
 * @param {Record<string, unknown>[]} rows
 * @param {{ tableName?: string }} [options]
 */
function writeSqlExportFile(filePath, headers, rows, options = {}) {
    const tableName = options.tableName || DEFAULT_TABLE_NAME;
    const resolved = path.resolve(filePath);
    const dir = path.dirname(resolved);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    const normalizedRows = rows.map((r) => pickRowForHeaders(headers, r));
    const sentinelLine = buildSentinelLine(tableName, headers);
    const headerBlock = buildHeaderBlock(tableName, headers);
    const insertBlocks = normalizedRows.map((r) => buildInsertBlock(tableName, headers, r)).join('');
    const body = `${sentinelLine}\n${headerBlock}${insertBlocks}`;
    fs.writeFileSync(resolved, body, 'utf8');
}

/**
 * @param {string} filePath
 * @param {string[]} headers - Column order (must match keys in row)
 * @param {Record<string, unknown>} row
 * @param {{ tableName?: string, upsertByPlayerId?: boolean }} [options]
 *   When `upsertByPlayerId` is not false (default), a row with the same `playerId`
 *   is replaced; otherwise a new INSERT is appended.
 */
function appendSqlRow(filePath, headers, row, options = {}) {
    const tableName = options.tableName || DEFAULT_TABLE_NAME;
    const upsertByPlayerId = options.upsertByPlayerId !== false;
    const resolved = path.resolve(filePath);
    const sentinelLine = buildSentinelLine(tableName, headers);
    const headerBlock = buildHeaderBlock(tableName, headers);
    const insertBlock = buildInsertBlock(tableName, headers, row);
    const dir = path.dirname(resolved);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    const maxAttempts = 8;
    const retryDelayMs = 250;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            const exists = fs.existsSync(resolved);
            if (!exists) {
                const body = `${sentinelLine}\n${headerBlock}${insertBlock}`;
                fs.writeFileSync(resolved, body, 'utf8');
            } else {
                const content = fs.readFileSync(resolved, 'utf8');
                const firstLine = content.split(/\r?\n/, 1)[0] ?? '';
                const firstLineTrim = firstLine.trimEnd();
                const matchesOurExport = firstLineTrim.startsWith(`-- TornAPIJS:${tableName}:`);

                if (!content.trim()) {
                    const body = `${sentinelLine}\n${headerBlock}${insertBlock}`;
                    fs.writeFileSync(resolved, body, 'utf8');
                } else if (!matchesOurExport) {
                    const normalizedContent = content.endsWith('\n') ? content : `${content}\n`;
                    const body = `${sentinelLine}\n${headerBlock}${normalizedContent}${insertBlock}`;
                    fs.writeFileSync(resolved, body, 'utf8');
                } else if (upsertByPlayerId) {
                    const parsed = parsePlayerStatsSql(content);
                    if (parsed && Array.isArray(parsed.rows)) {
                        const rows = parsed.rows.map((r) => pickRowForHeaders(headers, r));
                        const newRow = pickRowForHeaders(headers, row);
                        const pId = newRow.playerId;
                        if (pId != null && String(pId).trim() !== '') {
                            const idx = rows.findIndex((r) => samePlayerId(r.playerId, pId));
                            if (idx >= 0) rows[idx] = newRow;
                            else rows.push(newRow);
                        } else {
                            rows.push(newRow);
                        }
                        writeSqlExportFile(resolved, headers, rows, { tableName });
                    } else {
                        fs.appendFileSync(resolved, insertBlock, 'utf8');
                    }
                } else {
                    fs.appendFileSync(resolved, insertBlock, 'utf8');
                }
            }
            return { path: resolved, created: !exists };
        } catch (err) {
            if (!isWindowsLockError(err) || attempt === maxAttempts) {
                if (isWindowsLockError(err)) {
                    throw new Error(
                        `SQL file is locked by another app/process: ${resolved}. `
                        + 'Close it and run again, or pass a different output path.',
                    );
                }
                throw err;
            }
            sleepMs(retryDelayMs);
        }
    }
}

module.exports = {
    sqlLiteral,
    decodeHtmlEntities,
    appendSqlRow,
    writeSqlExportFile,
    pickRowForHeaders,
    DEFAULT_TABLE_NAME,
};
