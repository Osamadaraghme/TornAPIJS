/**
 * Parse TornAPIJS export .sql files (multi-line or single-line INSERT INTO ... VALUES).
 */

function parseColumnsFromExportHeader(content) {
    const m = content.match(/^-- columns:\s*(.+)$/m);
    if (!m) return null;
    return m[1]
        .split(/\s*,\s*/)
        .map((s) => s.trim())
        .filter((c) => c.length > 0);
}

function findMatchingParen(str, openPos) {
    if (str[openPos] !== '(') return -1;
    let depth = 0;
    let inString = false;
    for (let i = openPos; i < str.length; i++) {
        const c = str[i];
        if (!inString) {
            if (c === '(') depth++;
            else if (c === ')') {
                depth--;
                if (depth === 0) return i;
            } else if (c === "'") {
                inString = true;
            }
        } else if (c === "'" && str[i + 1] === "'") {
            i++;
        } else if (c === "'") {
            inString = false;
        }
    }
    return -1;
}

function nextNonSpace(str, i) {
    while (i < str.length && /\s/.test(str[i])) i++;
    return i;
}

function skipQuotedIdentOrWord(str, i) {
    if (str[i] === '"') {
        const end = str.indexOf('"', i + 1);
        return end === -1 ? str.length : end + 1;
    }
    while (i < str.length && /[\w.]/.test(str[i])) i++;
    return i;
}

function parseColumnList(inner) {
    return inner
        .split(',')
        .map((s) => {
            const t = s.trim();
            const m = t.match(/^"((?:[^"]|"")*)"\s*$/);
            if (m) return m[1].replace(/""/g, '"');
            return t.replace(/^"|"$/g, '');
        })
        .filter((c) => c.length > 0);
}

function parseSqlValues(inner) {
    const out = [];
    let i = 0;
    const len = inner.length;
    while (i < len) {
        while (i < len && (/\s/.test(inner[i]) || inner[i] === ',')) i++;
        if (i >= len) break;
        const rest = inner.slice(i);
        if (/^NULL\b/i.test(rest)) {
            out.push(null);
            i += 4;
            continue;
        }
        if (/^TRUE\b/i.test(rest)) {
            out.push(true);
            i += 4;
            continue;
        }
        if (/^FALSE\b/i.test(rest)) {
            out.push(false);
            i += 5;
            continue;
        }
        if (inner[i] === "'") {
            i++;
            let s = '';
            while (i < len) {
                if (inner[i] === "'" && inner[i + 1] === "'") {
                    s += "'";
                    i += 2;
                    continue;
                }
                if (inner[i] === "'") {
                    i++;
                    break;
                }
                s += inner[i];
                i++;
            }
            out.push(s);
            continue;
        }
        const numM = rest.match(/^-?\d+(\.\d+)?([eE][+-]?\d+)?/);
        if (numM) {
            i += numM[0].length;
            const n = Number(numM[0]);
            out.push(Number.isFinite(n) ? n : numM[0]);
            continue;
        }
        i++;
    }
    return out;
}

/**
 * @returns {{ columns: string[], rows: Record<string, unknown>[] } | null}
 */
function parsePlayerStatsSql(content) {
    if (!content || typeof content !== 'string') return null;
    const rows = [];
    let columns = null;
    let searchFrom = 0;
    const lower = content.toLowerCase();

    while (searchFrom < content.length) {
        const idx = lower.indexOf('insert into', searchFrom);
        if (idx === -1) break;

        let pos = idx + 'insert into'.length;
        pos = nextNonSpace(content, pos);
        pos = skipQuotedIdentOrWord(content, pos);
        pos = nextNonSpace(content, pos);
        if (content[pos] !== '(') {
            searchFrom = idx + 1;
            continue;
        }
        const colClose = findMatchingParen(content, pos);
        if (colClose < 0) break;
        const colInner = content.slice(pos + 1, colClose);
        const cols = parseColumnList(colInner);

        pos = nextNonSpace(content, colClose + 1);
        const rem = content.slice(pos);
        const vm = rem.match(/^values\s*\(/i);
        if (!vm) {
            searchFrom = colClose + 1;
            continue;
        }
        pos = pos + vm[0].length - 1;
        if (content[pos] !== '(') {
            searchFrom = colClose + 1;
            continue;
        }
        const valClose = findMatchingParen(content, pos);
        if (valClose < 0) break;
        const valInner = content.slice(pos + 1, valClose);
        const vals = parseSqlValues(valInner);

        if (cols.length !== vals.length || cols.length === 0) {
            searchFrom = valClose + 1;
            continue;
        }

        const row = {};
        cols.forEach((c, j) => {
            row[c] = vals[j];
        });
        rows.push(row);
        if (!columns) columns = cols;
        searchFrom = valClose + 1;
    }

    if (rows.length > 0 && columns) {
        return { columns, rows };
    }
    const fromHeader = parseColumnsFromExportHeader(content);
    if (fromHeader?.length) {
        return { columns: fromHeader, rows: [] };
    }
    return null;
}

module.exports = {
    parsePlayerStatsSql,
};
