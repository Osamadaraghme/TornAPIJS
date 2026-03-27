/**
 * Append one row to a CSV file: create file with header if missing, else append.
 */

const fs = require('fs');
const path = require('path');

function isWindowsLockError(err) {
    return err?.code === 'EBUSY' || err?.code === 'EPERM';
}

function sleepMs(ms) {
    // Synchronous sleep so this utility can stay sync-only.
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** Escape a single CSV field (RFC-style quoting when needed). */
function escapeCsvField(value) {
    if (value == null || value === '') return '';
    const s = String(value);
    if (/[",\r\n]/.test(s)) {
        return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
}

/**
 * @param {string} filePath - Absolute or relative path to the CSV file
 * @param {string[]} headers - Column order (must match keys in row)
 * @param {Record<string, unknown>} row - One object per header key
 */
function appendCsvRow(filePath, headers, row) {
    const resolved = path.resolve(filePath);
    const headerLine = `${headers.map((h) => escapeCsvField(h)).join(',')}\n`;
    const headerLineNoNl = headerLine.slice(0, -1);
    const line = `${headers.map((h) => escapeCsvField(row[h])).join(',')}\n`;
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
                fs.writeFileSync(resolved, headerLine + line, 'utf8');
            } else {
                const content = fs.readFileSync(resolved, 'utf8');
                const firstLine = content.split(/\r?\n/, 1)[0] ?? '';
                const hasHeader = firstLine.trimEnd() === headerLineNoNl;

                if (!content) {
                    fs.writeFileSync(resolved, headerLine + line, 'utf8');
                } else if (!hasHeader) {
                    const normalizedContent = content.endsWith('\n') ? content : `${content}\n`;
                    fs.writeFileSync(resolved, headerLine + normalizedContent + line, 'utf8');
                } else {
                    fs.appendFileSync(resolved, line, 'utf8');
                }
            }
            return { path: resolved, created: !exists };
        } catch (err) {
            if (!isWindowsLockError(err) || attempt === maxAttempts) {
                if (isWindowsLockError(err)) {
                    throw new Error(
                        `CSV file is locked by another app/process: ${resolved}. `
                        + 'Close it (for example Excel/Notepad) and run again, '
                        + 'or pass a different CSV path.',
                    );
                }
                throw err;
            }
            sleepMs(retryDelayMs);
        }
    }
}

module.exports = {
    escapeCsvField,
    appendCsvRow,
};
