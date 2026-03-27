/**
 * Append one INSERT row to a .sql file. New files start with a header comment
 * block listing column names (same order as the model headers), then INSERTs.
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_TABLE_NAME = 'player_stats';

function isWindowsLockError(err) {
    return err?.code === 'EBUSY' || err?.code === 'EPERM';
}

function sleepMs(ms) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** SQL literal for VALUES (...): NULL, numbers, booleans, quoted strings. */
function sqlLiteral(value) {
    if (value === null || value === undefined) return 'NULL';
    if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) return 'NULL';
        return String(value);
    }
    const s = String(value);
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

function buildInsertLine(tableName, headers, row) {
    const cols = headers.map(quoteIdent).join(', ');
    const vals = headers.map((h) => sqlLiteral(row[h])).join(', ');
    return `INSERT INTO ${quoteIdent(tableName)} (${cols}) VALUES (${vals});\n`;
}

/**
 * @param {string} filePath
 * @param {string[]} headers - Column order (must match keys in row)
 * @param {Record<string, unknown>} row
 * @param {{ tableName?: string }} [options]
 */
function appendSqlRow(filePath, headers, row, options = {}) {
    const tableName = options.tableName || DEFAULT_TABLE_NAME;
    const resolved = path.resolve(filePath);
    const sentinelLine = buildSentinelLine(tableName, headers);
    const headerBlock = buildHeaderBlock(tableName, headers);
    const insertLine = buildInsertLine(tableName, headers, row);
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
                const body = `${sentinelLine}\n${headerBlock}${insertLine}`;
                fs.writeFileSync(resolved, body, 'utf8');
            } else {
                const content = fs.readFileSync(resolved, 'utf8');
                const firstLine = content.split(/\r?\n/, 1)[0] ?? '';
                const hasSentinel = firstLine.trimEnd() === sentinelLine;

                if (!content.trim()) {
                    const body = `${sentinelLine}\n${headerBlock}${insertLine}`;
                    fs.writeFileSync(resolved, body, 'utf8');
                } else if (!hasSentinel) {
                    const normalizedContent = content.endsWith('\n') ? content : `${content}\n`;
                    const body = `${sentinelLine}\n${headerBlock}${normalizedContent}${insertLine}`;
                    fs.writeFileSync(resolved, body, 'utf8');
                } else {
                    fs.appendFileSync(resolved, insertLine, 'utf8');
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
    appendSqlRow,
    DEFAULT_TABLE_NAME,
};
