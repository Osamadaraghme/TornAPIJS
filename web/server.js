/**
 * Web UI: one page per export API, plus dynamic SQL export viewers.
 * Run from project root: npm run web  (default http://localhost:3847)
 */

const path = require('path');
const fs = require('fs');
const fsp = require('fs').promises;
const express = require('express');
const { marked } = require('marked');
const {
    exportRandomActivePlayerToSql,
    exportPlayerByIdToSql,
    exportFactionByHofRankToSql,
} = require(path.join(__dirname, '..', 'src', 'controllers', 'player-stats-csv-controller.js'));
const { parsePlayerStatsSql } = require(path.join(__dirname, 'lib', 'parse-player-stats-sql.js'));
const {
    decodeHtmlEntities,
    writeSqlExportFile,
    pickRowForHeaders,
    DEFAULT_TABLE_NAME,
} = require(path.join(__dirname, '..', 'src', 'utils', 'sql-append.js'));
const { CSV_HEADERS } = require(path.join(__dirname, '..', 'src', 'models', 'player-stats-csv-model.js'));

const ROOT = path.join(__dirname, '..');
const EXPORTS_DIR = path.join(ROOT, 'exports');
const PORT = Number(process.env.TORN_WEB_PORT || 3847);

/** Field order in export table view: recruiter-first, `recordedAt` last. */
const RECRUITER_FIELD_ORDER = [
    'name',
    'playerId',
    'tier',
    'xanScore',
    'avgXanaxPerDay',
    'level',
    'hoursSinceLastAction',
    'factionName',
    'hasFaction',
    'companyName',
    'hasCompany',
    'ageDays',
    'ageMonths',
    'ageYears',
    'requestedFactionHofRank',
    'allTimeXanaxTaken',
    'xanaxTakenUntilLastMonth',
    'xanaxTakenDuringLastMonth',
    'periodUsed',
    'xanaxMode',
    'tornApiCallsUsed',
    'recordedAt',
];

const FIELD_LABELS = {
    recordedAt: 'Recorded at',
    requestedFactionHofRank: 'Requested HoF rank',
    name: 'Player name',
    playerId: 'Player ID',
    level: 'Level',
    ageDays: 'Age (days)',
    ageMonths: 'Age (months)',
    ageYears: 'Age (years)',
    hasFaction: 'Has faction',
    hasCompany: 'Has company',
    factionName: 'Faction',
    companyName: 'Company',
    hoursSinceLastAction: 'Hours since last action',
    xanScore: 'Xan score',
    tier: 'Tier',
    avgXanaxPerDay: 'Avg. Xanax / day',
    allTimeXanaxTaken: 'All-time Xanax taken',
    xanaxTakenUntilLastMonth: 'Xanax until last month',
    xanaxTakenDuringLastMonth: 'Xanax last month',
    periodUsed: 'Period used',
    xanaxMode: 'Xanax mode',
    tornApiCallsUsed: 'API calls used',
};

function escapeHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

async function sendMarkdownPage(res, relPath, pageTitle, activeNav) {
    const full = path.join(ROOT, relPath);
    const md = await fsp.readFile(full, 'utf8');
    const html = marked.parse(md);
    const inner = `<article class="md-doc">${html}</article>`;
    res.type('html').send(layout(pageTitle, activeNav, inner, 'page-md-doc'));
}

function nav(active) {
    const items = [
        ['/', 'Home', 'home'],
        ['/readme', 'README', 'readme'],
        ['/release-notes', 'Release notes', 'releases'],
        ['/api/random', 'Random ranked', 'random'],
        ['/api/by-id', 'Player by ID', 'byid'],
        ['/api/faction-hof', 'Faction HoF', 'hof'],
        ['/exports', 'SQL exports', 'exports'],
    ];
    const links = items
        .map(([href, label, id]) => {
            const cls = id === active ? ' aria-current="page"' : '';
            return `<a href="${href}"${cls}>${escapeHtml(label)}</a>`;
        })
        .join('\n');
    return `<header><nav><a href="/" class="brand">Botato's Torn Scripts</a>${links}</nav></header>`;
}

function layout(title, activeNav, inner, bodyClass = '') {
    const bodyAttr = bodyClass ? ` class="${escapeHtml(bodyClass)}"` : '';
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" href="/static/style.css"/>
</head>
<body${bodyAttr}>
${nav(activeNav)}
<main>
${inner}
</main>
</body>
</html>`;
}

function orderColumnsForRecruiterView(columns) {
    const colSet = new Set(columns);
    const knownOrdered = RECRUITER_FIELD_ORDER.filter((f) => colSet.has(f));
    const knownSet = new Set(knownOrdered);
    const extras = columns.filter((c) => !knownSet.has(c));
    const withoutRecorded = knownOrdered.filter((c) => c !== 'recordedAt');
    const hasRecordedAt = colSet.has('recordedAt');
    return [...withoutRecorded, ...extras.filter((e) => e !== 'recordedAt'), ...(hasRecordedAt ? ['recordedAt'] : [])];
}

function fieldLabelForColumn(col) {
    if (Object.prototype.hasOwnProperty.call(FIELD_LABELS, col)) return FIELD_LABELS[col];
    return col.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (ch) => ch.toUpperCase());
}

function tornProfileUrlForPlayerId(rawId) {
    const n = Number(rawId);
    if (!Number.isFinite(n) || n <= 0) return null;
    const id = Math.floor(n);
    if (id <= 0) return null;
    return `https://www.torn.com/profiles.php?XID=${id}`;
}

function cellTdClass(value) {
    if (value === null || value === undefined) return 'td-null';
    if (typeof value === 'boolean') return 'td-bool';
    if (typeof value === 'number') return 'td-num';
    return 'td-str';
}

function formatTableCell(value) {
    if (value === null || value === undefined) {
        return '<span class="cell-null">NULL</span>';
    }
    if (typeof value === 'boolean') {
        return value ? '<span class="cell-bool cell-bool-true">TRUE</span>' : '<span class="cell-bool cell-bool-false">FALSE</span>';
    }
    if (typeof value === 'number') {
        return `<span class="cell-num">${escapeHtml(String(value))}</span>`;
    }
    const display = decodeHtmlEntities(String(value));
    return `<span class="cell-str">${escapeHtml(display)}</span>`;
}

function formatTransposedDataCell(col, row) {
    const v = row[col];
    const inner = formatTableCell(v);
    let profileId = null;
    if (col === 'playerId') {
        profileId = typeof v === 'number' ? v : Number(v);
        if (!Number.isFinite(profileId)) profileId = row.playerId != null ? Number(row.playerId) : null;
    } else if (col === 'name') {
        profileId = row.playerId != null ? Number(row.playerId) : null;
    }
    const url = tornProfileUrlForPlayerId(profileId);
    if (url && (col === 'name' || col === 'playerId')) {
        return `<a class="cell-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${inner}</a>`;
    }
    return inner;
}

function renderPlayerStatsTable(parsed, sqlBasename) {
    const { columns, rows } = parsed;
    const orderedColumns = orderColumnsForRecruiterView(columns);
    const deleteAction = `/exports/view/${encodeURIComponent(sqlBasename)}/delete-row`;
    if (rows.length === 0) {
        return `<p class="export-empty muted">No data rows in this file. The header lists <strong>${columns.length}</strong> field(s); add rows from an API or restore from backup.</p>`;
    }
    const headerCells = ['<th scope="col" class="th-corner">Field</th>'];
    for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const url = tornProfileUrlForPlayerId(r.playerId);
        const idText = r.playerId != null ? `#${escapeHtml(String(r.playerId))}` : `Row ${i + 1}`;
        const label =
            url && r.playerId != null
                ? `<a class="cell-link th-profile-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${idText}</a>`
                : idText;
        headerCells.push(`<th scope="col" class="th-record">
  <div class="th-record-top">${label}</div>
  <form class="form-delete-row" method="post" action="${escapeHtml(deleteAction)}" onsubmit="return confirm('Remove this row from the SQL file?');">
    <input type="hidden" name="rowIndex" value="${i}"/>
    <button type="submit" class="btn-delete">Delete</button>
  </form>
</th>`);
    }
    const bodyRows = orderedColumns
        .map((col) => {
            const fieldCell = `<th scope="row" class="field-name">${escapeHtml(fieldLabelForColumn(col))}</th>`;
            const cells = rows
                .map((row) => {
                    const v = row[col];
                    return `<td class="${cellTdClass(v)}">${formatTransposedDataCell(col, row)}</td>`;
                })
                .join('');
            return `<tr>${fieldCell}${cells}</tr>`;
        })
        .join('');
    return `<div class="table-scroll table-scroll-transposed" role="region" aria-label="Export data" tabindex="0">
<table class="export-table export-table-transposed">
<thead><tr>${headerCells.join('')}</tr></thead>
<tbody>${bodyRows}</tbody>
</table>
</div>`;
}

async function listSqlBasenames() {
    try {
        const names = await fsp.readdir(EXPORTS_DIR);
        return names.filter((n) => n.endsWith('.sql')).sort();
    } catch {
        return [];
    }
}

function safeSqlBasename(raw) {
    if (raw == null || typeof raw !== 'string') return null;
    const base = path.basename(raw);
    if (!/^[a-zA-Z0-9._-]+\.sql$/i.test(base)) return null;
    return base;
}

function resolvedExportPath(base) {
    const full = path.join(EXPORTS_DIR, base);
    const normExports = path.normalize(EXPORTS_DIR + path.sep);
    if (!path.normalize(full + path.sep).startsWith(normExports)) return null;
    return full;
}

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use('/static', express.static(path.join(__dirname, 'public')));

app.get('/readme', async (req, res) => {
    try {
        await sendMarkdownPage(res, 'README.md', 'README', 'readme');
    } catch (err) {
        res.status(500)
            .type('html')
            .send(
                layout(
                    'README',
                    'readme',
                    `<p class="msg-err">${escapeHtml(err.message || String(err))}</p>`,
                    'page-md-doc',
                ),
            );
    }
});

app.get('/release-notes', async (req, res) => {
    try {
        await sendMarkdownPage(res, 'RELEASE_NOTES.md', 'Release notes', 'releases');
    } catch (err) {
        res.status(500)
            .type('html')
            .send(
                layout(
                    'Release notes',
                    'releases',
                    `<p class="msg-err">${escapeHtml(err.message || String(err))}</p>`,
                    'page-md-doc',
                ),
            );
    }
});

app.get('/', async (req, res) => {
    const files = await listSqlBasenames();
    const exportLinks = files.length
        ? `<ul>${files.map((f) => `<li><a href="/exports/view/${encodeURIComponent(f)}">${escapeHtml(f)}</a></li>`).join('')}</ul>`
        : '<p class="msg-ok">No <code>.sql</code> files yet. Run an API to create exports under <code>exports/</code>.</p>';
    const body = `
<h1>Home</h1>
<div class="card">
  <p>Documentation: <a href="/readme">README</a> · <a href="/release-notes">Release notes</a></p>
  <p>Run the three recruitment APIs from their pages. Export files appear under <code>exports/</code>.</p>
  <p><a class="btn" href="/api/random">Random active ranked</a>
  <a class="btn" href="/api/by-id">Player by ID</a>
  <a class="btn" href="/api/faction-hof">Faction HoF</a></p>
</div>
<div class="card">
  <h2>SQL export files</h2>
  <p><a href="/exports">Browse all exports</a></p>
  ${exportLinks}
</div>`;
    res.type('html').send(layout("Botato's Torn Scripts", 'home', body));
});

app.get('/exports', async (req, res) => {
    const files = await listSqlBasenames();
    const list = files.length
        ? `<ul>${files.map((f) => `<li><a href="/exports/view/${encodeURIComponent(f)}">${escapeHtml(f)}</a></li>`).join('')}</ul>`
        : '<p>No <code>.sql</code> files in <code>exports/</code>.</p>';
    const body = `<h1>SQL exports</h1><div class="card">${list}</div>`;
    res.type('html').send(layout('SQL exports', 'exports', body));
});

app.post('/exports/view/:file/delete-row', async (req, res) => {
    const base = safeSqlBasename(req.params.file);
    if (!base) {
        res.status(400).type('html').send(layout('Bad file', 'exports', '<p class="msg-err">Invalid file name.</p>'));
        return;
    }
    const full = resolvedExportPath(base);
    if (!full || !fs.existsSync(full)) {
        res.status(404).type('html').send(layout('Not found', 'exports', `<p class="msg-err">File not found: ${escapeHtml(base)}</p>`));
        return;
    }
    const rowIndex = Number(req.body?.rowIndex);
    if (!Number.isInteger(rowIndex) || rowIndex < 0) {
        res.redirect(303, `/exports/view/${encodeURIComponent(base)}`);
        return;
    }
    const text = await fsp.readFile(full, 'utf8');
    const parsed = parsePlayerStatsSql(text);
    if (!parsed || rowIndex >= parsed.rows.length) {
        res.redirect(303, `/exports/view/${encodeURIComponent(base)}`);
        return;
    }
    const nextRows = parsed.rows.filter((_, i) => i !== rowIndex);
    const normalized = nextRows.map((r) => pickRowForHeaders(CSV_HEADERS, r));
    writeSqlExportFile(full, CSV_HEADERS, normalized, { tableName: DEFAULT_TABLE_NAME });
    res.redirect(303, `/exports/view/${encodeURIComponent(base)}`);
});

app.get('/exports/view/:file', async (req, res) => {
    const base = safeSqlBasename(req.params.file);
    if (!base) {
        res.status(400).type('html').send(layout('Bad file', 'exports', '<p class="msg-err">Invalid file name.</p>'));
        return;
    }
    const full = resolvedExportPath(base);
    if (!full || !fs.existsSync(full)) {
        res.status(404).type('html').send(layout('Not found', 'exports', `<p class="msg-err">File not found: ${escapeHtml(base)}</p>`));
        return;
    }
    const text = await fsp.readFile(full, 'utf8');
    const wantRaw = req.query.raw === '1' || req.query.raw === 'true';
    const parsed = parsePlayerStatsSql(text);
    const viewPath = `/exports/view/${encodeURIComponent(base)}`;

    const links = `<p class="export-view-links"><a href="/exports">All exports</a></p>`;
    let meta = '';
    let mainBlock;

    if (parsed && !wantRaw) {
        meta = `<p class="export-meta"><span class="row-count">${parsed.rows.length} row${parsed.rows.length === 1 ? '' : 's'}</span>
  <span class="sep">·</span>
  <a href="${escapeHtml(viewPath)}?raw=1">Raw SQL</a></p>`;
        mainBlock = `<div class="card card-table">${renderPlayerStatsTable(parsed, base)}</div>`;
    } else {
        if (parsed && wantRaw) {
            meta = `<p class="export-meta"><a href="${escapeHtml(viewPath)}">Table view</a> — ${parsed.rows.length} row${parsed.rows.length === 1 ? '' : 's'}</p>`;
        } else if (!parsed && !wantRaw) {
            meta = `<p class="export-meta muted">Raw SQL only — file does not match expected <code>INSERT INTO … VALUES</code> shape for table view.</p>`;
        }
        mainBlock = `<div class="card card-raw"><pre class="pre">${escapeHtml(text)}</pre></div>`;
    }

    const toolbar = `<div class="export-toolbar">${links}${meta}</div>`;
    const body = `
<h1>${escapeHtml(base)}</h1>
${toolbar}
${mainBlock}`;
    res.type('html').send(layout(base, 'exports', body, 'page-export-sql'));
});

app.get('/api/random', (req, res) => {
    const body = `
<h1>Random active ranked</h1>
<form method="post" action="/api/random/run" class="card">
  <div class="grid2">
    <div><label>Active within hours</label><input name="activeWithinHours" type="number" value="24"/></div>
    <div><label>Min ID</label><input name="minId" type="number" value="1"/></div>
    <div><label>Max ID</label><input name="maxId" type="number" value="3000000"/></div>
    <div><label>Max tries</label><input name="maxTries" type="number" value="60"/></div>
    <div><label>Period (positional)</label><input name="period" value="month"/></div>
    <div><label>Tier</label><input name="tier" value="ALL"/></div>
    <div><label>Has faction (Y/N/ANY)</label><input name="hasFaction" value="ANY"/></div>
    <div><label>Has company (Y/N/ANY)</label><input name="hasCompany" value="ANY"/></div>
    <div><label>Min level (optional)</label><input name="minLevel" placeholder="empty"/></div>
    <div><label>SQL path (optional)</label><input name="sqlPath" placeholder="default exports path"/></div>
  </div>
  <button type="submit">Run &amp; append SQL</button>
</form>`;
    res.type('html').send(layout('Random ranked', 'random', body));
});

app.post('/api/random/run', async (req, res) => {
    const o = req.body;
    const opts = {
        activeWithinHours: o.activeWithinHours ? Number(o.activeWithinHours) : undefined,
        minId: o.minId ? Number(o.minId) : undefined,
        maxId: o.maxId ? Number(o.maxId) : undefined,
        maxTries: o.maxTries ? Number(o.maxTries) : undefined,
        period: o.period === 'month' ? 'month' : 'day',
        tier: o.tier || 'ALL',
        hasFaction: o.hasFaction || 'ANY',
        hasCompany: o.hasCompany || 'ANY',
        minLevel: o.minLevel !== '' && o.minLevel != null ? Number(o.minLevel) : undefined,
        ...(o.sqlPath && String(o.sqlPath).trim() ? { sqlPath: String(o.sqlPath).trim() } : {}),
    };
    try {
        const apiKey = process.env.TORN_API_KEY;
        const out = await exportRandomActivePlayerToSql(apiKey, opts);
        const base = path.basename(out.path);
        const body = `
<h1>Random ranked — result</h1>
<p class="msg-ok">Appended row. File: <a href="/exports/view/${encodeURIComponent(base)}">${escapeHtml(out.path)}</a></p>
<div class="card"><pre class="pre">${escapeHtml(JSON.stringify(out, null, 2))}</pre></div>
<p><a href="/api/random">Run again</a></p>`;
        res.type('html').send(layout('Random result', 'random', body));
    } catch (err) {
        const body = `<h1>Random ranked — error</h1><p class="msg-err">${escapeHtml(err.message || err)}</p><p><a href="/api/random">Back</a></p>`;
        res.status(500).type('html').send(layout('Error', 'random', body));
    }
});

app.get('/api/by-id', (req, res) => {
    const body = `
<h1>Player by ID</h1>
<form method="post" action="/api/by-id/run" class="card">
  <label>Player ID</label><input name="playerId" required/>
  <label>SQL path (optional)</label><input name="sqlPath" placeholder="default exports path"/>
  <button type="submit">Fetch &amp; append SQL</button>
</form>`;
    res.type('html').send(layout('Player by ID', 'byid', body));
});

app.post('/api/by-id/run', async (req, res) => {
    const { playerId, sqlPath } = req.body;
    if (playerId == null || String(playerId).trim() === '') {
        res.status(400).type('html').send(layout('Error', 'byid', '<p class="msg-err">playerId required</p><a href="/api/by-id">Back</a>'));
        return;
    }
    const opts = sqlPath && String(sqlPath).trim() ? { sqlPath: String(sqlPath).trim() } : {};
    try {
        const out = await exportPlayerByIdToSql(playerId, opts);
        const base = path.basename(out.path);
        const body = `
<h1>Player by ID — result</h1>
<p class="msg-ok">Appended row. File: <a href="/exports/view/${encodeURIComponent(base)}">${escapeHtml(out.path)}</a></p>
<div class="card"><pre class="pre">${escapeHtml(JSON.stringify(out, null, 2))}</pre></div>
<p><a href="/api/by-id">Again</a></p>`;
        res.type('html').send(layout('By ID result', 'byid', body));
    } catch (err) {
        const body = `<h1>Player by ID — error</h1><p class="msg-err">${escapeHtml(err.message || err)}</p><p><a href="/api/by-id">Back</a></p>`;
        res.status(500).type('html').send(layout('Error', 'byid', body));
    }
});

app.get('/api/faction-hof', (req, res) => {
    const body = `
<h1>Faction Hall of Fame rank</h1>
<form method="post" action="/api/faction-hof/run" class="card">
  <label>HoF rank (e.g. 1)</label><input name="hofRank" type="number" min="1" value="1" required/>
  <label>Max players (optional cap)</label><input name="maxPlayers" type="number" min="1" placeholder="all members"/>
  <label>SQL path (optional)</label><input name="sqlPath" placeholder="default exports path"/>
  <button type="submit">Export members</button>
</form>`;
    res.type('html').send(layout('Faction HoF', 'hof', body));
});

app.post('/api/faction-hof/run', async (req, res) => {
    const { hofRank, maxPlayers, sqlPath } = req.body;
    if (hofRank == null || String(hofRank).trim() === '') {
        res.status(400).type('html').send(layout('Error', 'hof', '<p class="msg-err">hofRank required</p><a href="/api/faction-hof">Back</a>'));
        return;
    }
    const opts = {};
    if (maxPlayers !== '' && maxPlayers != null) opts.maxPlayers = Number(maxPlayers);
    if (sqlPath && String(sqlPath).trim()) opts.sqlPath = String(sqlPath).trim();
    try {
        const out = await exportFactionByHofRankToSql(hofRank, opts);
        const base = path.basename(out.path);
        const body = `
<h1>Faction HoF — result</h1>
<p class="msg-ok">Wrote ${escapeHtml(String(out.rowsWritten))} row(s). File: <a href="/exports/view/${encodeURIComponent(base)}">${escapeHtml(out.path)}</a></p>
<div class="card"><pre class="pre">${escapeHtml(JSON.stringify(out, null, 2))}</pre></div>
<p><a href="/api/faction-hof">Again</a></p>`;
        res.type('html').send(layout('HoF result', 'hof', body));
    } catch (err) {
        const body = `<h1>Faction HoF — error</h1><p class="msg-err">${escapeHtml(err.message || err)}</p><p><a href="/api/faction-hof">Back</a></p>`;
        res.status(500).type('html').send(layout('Error', 'hof', body));
    }
});

app.listen(PORT, () => {
    console.log(`Botato's Torn Scripts web UI http://localhost:${PORT}`);
});
