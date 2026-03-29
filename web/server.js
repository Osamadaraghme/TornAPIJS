/**
 * Web UI: one page per export API, plus dynamic SQL export viewers.
 * Run from project root: npm run web  (default http://localhost:3847)
 */

const path = require('path');
const fs = require('fs');
const fsp = require('fs').promises;
const express = require('express');
const { marked } = require('marked');
const GithubSlugger = require('github-slugger').default;
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
const {
    XANAX_PER_DAY_FOR_FULL_SCORE,
    HOURS_PER_DAY_FOR_FULL_TIME_SCORE,
    RECRUITMENT_TIER_XAN_WEIGHT,
    RECRUITMENT_TIER_TIME_WEIGHT,
} = require(path.join(__dirname, '..', 'src', 'constants.js'));

const ROOT = path.join(__dirname, '..');
const EXPORTS_DIR = path.join(ROOT, 'exports');
const PORT = Number(process.env.TORN_WEB_PORT || 3847);

/** Shown in export SQL but omitted from the transposed table (used only for name links). */
const EXPORT_VIEW_HIDDEN_COLUMNS = new Set(['factionId', 'companyId']);

/** Field order in export table view: recruiter-first; `recordedAt` above `level` (shown as GMT). */
const RECRUITER_FIELD_ORDER = [
    'name',
    'playerId',
    'tier',
    'combinedScore',
    'xanScore',
    'averageTimeScore',
    'avgXanaxPerDay',
    'avgTimePlayedHoursPerDay',
    'recordedAt',
    'level',
    'hoursSinceLastAction',
    'factionName',
    'hasFaction',
    'companyName',
    'hasCompany',
    'activeStreak',
    'ageDays',
    'ageMonths',
    'ageYears',
    'requestedFactionHofRank',
    'allTimeXanaxTaken',
    'xanaxTakenUntilLastMonth',
    'xanaxTakenDuringLastMonth',
    'timePlayed',
    'timePlayedUntilLastMonth',
    'timePlayedDuringLastMonth',
    'periodUsed',
    'xanaxMode',
    'tornApiCallsUsed',
];

const FIELD_LABELS = {
    recordedAt: 'Recorded at (GMT)',
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
    averageTimeScore: 'Avg. time score',
    combinedScore: 'Combined score (75% xan / 25% time)',
    tier: 'Tier',
    avgXanaxPerDay: 'Avg. Xanax / day',
    avgTimePlayedHoursPerDay: 'Avg. hours played / day (last month)',
    allTimeXanaxTaken: 'All-time Xanax taken',
    xanaxTakenUntilLastMonth: 'Xanax until last month',
    xanaxTakenDuringLastMonth: 'Xanax last month',
    timePlayed: 'Time played (all-time)',
    timePlayedUntilLastMonth: 'Time played until last month',
    timePlayedDuringLastMonth: 'Time played (last month)',
    activeStreak: 'Active streak',
    periodUsed: 'Period used',
    xanaxMode: 'Stats mode',
    tornApiCallsUsed: 'API calls used',
};

/** SQL columns stored as seconds; shown in the export viewer as days + hours. */
const TIME_PLAYED_SECONDS_COLUMNS = new Set([
    'timePlayed',
    'timePlayedUntilLastMonth',
    'timePlayedDuringLastMonth',
]);

/** Hover `title` text for score columns (matches `src/utils/scoring.js` + `constants.js`). */
const SCORE_FORMULA_TOOLTIP = {
    xanScore:
        `Xan score (0–100): min(avg Xanax per day ÷ ${XANAX_PER_DAY_FOR_FULL_SCORE}, 1) × 100. `
        + `${XANAX_PER_DAY_FOR_FULL_SCORE} Xanax/day average ⇒ 100%.`,
    averageTimeScore:
        `Time score (0–100): min(avg hours played per day ÷ ${HOURS_PER_DAY_FOR_FULL_TIME_SCORE}, 1) × 100, `
        + `from the last-month timeplayed window. ${HOURS_PER_DAY_FOR_FULL_TIME_SCORE} h/day average ⇒ 100%.`,
    combinedScore:
        `Combined (0–100): ${RECRUITMENT_TIER_XAN_WEIGHT * 100}% × (xan score) + ${RECRUITMENT_TIER_TIME_WEIGHT * 100}% × (time score). `
        + `Both inputs are the 0–100 values in this row. Tier uses combined score.`,
};

function escapeHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * `marked` does not emit heading `id`s; GitHub README links use github-slugger rules.
 * Inject matching ids so `#fragment` links work on `/readme` and `/release-notes`.
 */
function addGithubHeadingIds(html) {
    const slugger = new GithubSlugger();
    return html.replace(/<h([1-6])(\s[^>]*)?>([\s\S]*?)<\/h\1>/gi, (full, level, attrs, inner) => {
        if (attrs && /\sid\s*=/.test(attrs)) return full;
        const textOnly = inner
            .replace(/<[^>]+>/g, '')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&amp;/g, '&')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .trim();
        if (!textOnly) return full;
        const id = slugger.slug(textOnly);
        return `<h${level} id="${escapeHtml(id)}">${inner}</h${level}>`;
    });
}

async function sendMarkdownPage(res, relPath, pageTitle, activeNav) {
    const full = path.join(ROOT, relPath);
    const md = await fsp.readFile(full, 'utf8');
    const html = addGithubHeadingIds(marked.parse(md));
    const inner = `<article class="md-doc">${html}</article>`;
    res.type('html').send(layout(pageTitle, activeNav, inner, 'page-md-doc'));
}

function nav(active) {
    const items = [
        ['/', 'Home', 'home'],
        ['/api/random', 'Random ranked', 'random'],
        ['/api/by-id', 'Player by ID', 'byid'],
        ['/api/faction-hof', 'Faction HoF', 'hof'],
        ['/exports', 'SQL exports', 'exports'],
        ['/readme', 'README', 'readme'],
        ['/release-notes', 'Release notes', 'releases'],
        ['/about', 'About', 'about'],
    ];
    const links = items
        .map(([href, label, id]) => {
            const cls = id === active ? ' aria-current="page"' : '';
            return `<a href="${href}"${cls}>${escapeHtml(label)}</a>`;
        })
        .join('\n');
    return `<header class="site-header">
  <div class="header-inner">
    <nav class="nav-links" aria-label="Main"><a href="/" class="brand">Botato's Torn Scripts</a>${links}</nav>
    <div class="quick-jump" role="search">
      <label class="visually-hidden" for="api-quick-filter">Quick go to page or player ID</label>
      <input type="search" id="api-quick-filter" class="quick-jump-input" autocomplete="off" placeholder="Quick go… (Ctrl+K)" spellcheck="false" aria-autocomplete="list" aria-controls="api-quick-results" aria-expanded="false"/>
      <ul id="api-quick-results" class="quick-jump-results" role="listbox" hidden></ul>
    </div>
  </div>
</header>`;
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
<script src="/static/site.js" defer></script>
</body>
</html>`;
}

/** Primary action row on API result / error pages (above the JSON block). */
function apiBackRow(href, label = 'Search again') {
    return `<p class="api-result-actions"><a class="btn" href="${escapeHtml(href)}">${escapeHtml(label)}</a></p>`;
}

function orderColumnsForRecruiterView(columns) {
    const colSet = new Set(columns);
    const knownOrdered = RECRUITER_FIELD_ORDER.filter((f) => colSet.has(f));
    const knownSet = new Set(knownOrdered);
    const extras = columns.filter((c) => !knownSet.has(c));
    return [...knownOrdered, ...extras];
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

function tornFactionProfileUrl(rawId) {
    const n = Number(rawId);
    if (!Number.isFinite(n) || n <= 0) return null;
    const id = Math.floor(n);
    if (id <= 0) return null;
    return `https://www.torn.com/factions.php?step=profile&ID=${id}`;
}

/** In-game company instance page (matches `companies.php` in Torn). */
function tornCompanyProfileUrl(rawId) {
    const n = Number(rawId);
    if (!Number.isFinite(n) || n <= 0) return null;
    const id = Math.floor(n);
    if (id <= 0) return null;
    return `https://www.torn.com/companies.php?ID=${id}`;
}

/** Level / score / any numeric that rounds to 69.00 → show “(nice)” in the export viewer. */
function isNiceSixtyNine(n) {
    if (typeof n !== 'number' || !Number.isFinite(n)) return false;
    return Math.round(n * 100) / 100 === 69;
}

function niceSixtyNineSuffix(n) {
    return isNiceSixtyNine(n) ? ' <span class="cell-nice">(nice)</span>' : '';
}

function cellTdClass(value) {
    if (value === null || value === undefined) return 'td-null';
    if (typeof value === 'boolean') return 'td-bool';
    if (typeof value === 'number') return 'td-num';
    return 'td-str';
}

/** Human-readable duration from cumulative seconds (Torn `timeplayed`). */
function formatSecondsAsDaysHoursHtml(rawSeconds) {
    if (rawSeconds === null || rawSeconds === undefined) {
        return '<span class="cell-null">NULL</span>';
    }
    const n = Number(rawSeconds);
    if (!Number.isFinite(n) || n < 0) {
        return '<span class="cell-str">—</span>';
    }
    const s = Math.floor(n);
    const days = Math.floor(s / 86400);
    const hours = Math.floor((s % 86400) / 3600);
    const minutes = Math.floor((s % 3600) / 60);
    const parts = [];
    if (days > 0) parts.push(`${days} day${days === 1 ? '' : 's'}`);
    if (hours > 0) parts.push(`${hours} hour${hours === 1 ? '' : 's'}`);
    if (minutes > 0 && parts.length < 2) {
        parts.push(`${minutes} minute${minutes === 1 ? '' : 's'}`);
    }
    if (parts.length === 0) {
        if (s > 0) {
            parts.push(`${s} second${s === 1 ? '' : 's'}`);
        } else {
            parts.push('0 hours');
        }
    }
    const label = parts.join(', ');
    return `<span class="cell-str cell-duration" title="${escapeHtml(String(s))} seconds total">${escapeHtml(label)}</span>`;
}

const UTC_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const UTC_WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** ISO / SQL datetime string → human line in GMT; tooltip keeps original value. */
function formatRecordedAtHtml(raw) {
    if (raw === null || raw === undefined) {
        return '<span class="cell-null">NULL</span>';
    }
    const s = String(raw).trim();
    if (!s) {
        return '<span class="cell-null">NULL</span>';
    }
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) {
        return formatTableCell(raw);
    }
    const wk = UTC_WEEKDAYS[d.getUTCDay()];
    const mon = UTC_MONTHS[d.getUTCMonth()];
    const day = d.getUTCDate();
    const y = d.getUTCFullYear();
    const hh = String(d.getUTCHours()).padStart(2, '0');
    const mm = String(d.getUTCMinutes()).padStart(2, '0');
    const ss = String(d.getUTCSeconds()).padStart(2, '0');
    const human = `${wk}, ${day} ${mon} ${y}, ${hh}:${mm}:${ss} GMT`;
    return `<span class="cell-str cell-recorded-at" title="${escapeHtml(s)}">${escapeHtml(human)}</span>`;
}

function formatTableCell(value) {
    if (value === null || value === undefined) {
        return '<span class="cell-null">NULL</span>';
    }
    if (typeof value === 'boolean') {
        return value ? '<span class="cell-bool cell-bool-true">TRUE</span>' : '<span class="cell-bool cell-bool-false">FALSE</span>';
    }
    if (typeof value === 'number') {
        return `<span class="cell-num">${escapeHtml(String(value))}</span>${niceSixtyNineSuffix(value)}`;
    }
    const display = decodeHtmlEntities(String(value));
    const trimmed = display.trim();
    if (/^-?\d+\.?\d*$|^-?\d*\.\d+$/.test(trimmed)) {
        const asNum = Number(trimmed);
        if (Number.isFinite(asNum)) {
            return `<span class="cell-num">${escapeHtml(display)}</span>${niceSixtyNineSuffix(asNum)}`;
        }
    }
    return `<span class="cell-str">${escapeHtml(display)}</span>`;
}

function formatTransposedDataCell(col, row) {
    const v = row[col];
    if (col === 'recordedAt') {
        return formatRecordedAtHtml(v);
    }
    if (TIME_PLAYED_SECONDS_COLUMNS.has(col)) {
        return formatSecondsAsDaysHoursHtml(v);
    }
    const inner = formatTableCell(v);
    let profileId = null;
    if (col === 'playerId') {
        profileId = typeof v === 'number' ? v : Number(v);
        if (!Number.isFinite(profileId)) profileId = row.playerId != null ? Number(row.playerId) : null;
    } else if (col === 'name') {
        profileId = row.playerId != null ? Number(row.playerId) : null;
    }
    const profileUrl = tornProfileUrlForPlayerId(profileId);
    if (profileUrl && (col === 'name' || col === 'playerId')) {
        return `<a class="cell-link" href="${escapeHtml(profileUrl)}" target="_blank" rel="noopener noreferrer">${inner}</a>`;
    }
    if (col === 'factionName') {
        const factionUrl = tornFactionProfileUrl(row.factionId);
        const hasLabel = v != null && String(v).trim() !== '';
        if (factionUrl && hasLabel) {
            return `<a class="cell-link" href="${escapeHtml(factionUrl)}" target="_blank" rel="noopener noreferrer">${inner}</a>`;
        }
    }
    if (col === 'companyName') {
        const companyUrl = tornCompanyProfileUrl(row.companyId);
        const hasLabel = v != null && String(v).trim() !== '';
        if (companyUrl && hasLabel) {
            return `<a class="cell-link" href="${escapeHtml(companyUrl)}" target="_blank" rel="noopener noreferrer">${inner}</a>`;
        }
    }
    const scoreTip = SCORE_FORMULA_TOOLTIP[col];
    if (scoreTip) {
        return `<span class="cell-score-formula" title="${escapeHtml(scoreTip)}">${inner}</span>`;
    }
    return inner;
}

function renderPlayerStatsTable(parsed, sqlBasename) {
    const { columns, rows } = parsed;
    const visibleColumns = columns.filter((c) => !EXPORT_VIEW_HIDDEN_COLUMNS.has(c));
    const orderedColumns = orderColumnsForRecruiterView(visibleColumns);
    const deleteAction = `/exports/view/${encodeURIComponent(sqlBasename)}/delete-row`;
    if (rows.length === 0) {
        return `<p class="export-empty muted">No data rows in this file. The header lists <strong>${columns.length}</strong> field(s); add rows from an API or restore from backup.</p>`;
    }
    const headerCells = ['<th scope="col" class="th-corner">Field</th>'];
    for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const url = tornProfileUrlForPlayerId(r.playerId);
        const idText = r.playerId != null ? `#${escapeHtml(String(r.playerId))}` : `Row ${i + 1}`;
        const idBlock =
            url && r.playerId != null
                ? `<a class="cell-link th-profile-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${idText}</a>`
                : idText;
        const nameRaw = r.name != null ? String(r.name).trim() : '';
        const nameInner = nameRaw !== '' ? escapeHtml(decodeHtmlEntities(nameRaw)) : '';
        const nameBlock =
            nameInner !== ''
                ? url && r.playerId != null
                    ? `<div class="th-record-player-name"><a class="cell-link th-profile-link th-record-player-name-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${nameInner}</a></div>`
                    : `<div class="th-record-player-name">${nameInner}</div>`
                : '';
        headerCells.push(`<th scope="col" class="th-record">
  <div class="th-record-top">${idBlock}${nameBlock}</div>
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
                    const tdCls = TIME_PLAYED_SECONDS_COLUMNS.has(col) ? 'td-str' : cellTdClass(v);
                    return `<td class="${tdCls}">${formatTransposedDataCell(col, row)}</td>`;
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

// /about copy is author-owned; keep this wording unless Botato asks to change it.
app.get('/about', (req, res) => {
    const tornProfile = 'https://www.torn.com/profiles.php?XID=3961724';
    const body = `
<div class="card about-page">
  <h1>About</h1>
  <p class="about-lead">Hi — I’m <strong>Botato</strong> (<a href="${escapeHtml(tornProfile)}" target="_blank" rel="noopener noreferrer">Torn ID 3961724</a>). These days I’m a programmer who spends far too much time in <strong>Torn City</strong> (former teacher — the classroom chapter is closed).</p>
  <p>This little site is a set of scripts I use for recruitment and stats: nothing fancy, just tools that talk to Torn’s API and land tidy SQL exports. If you’re here, you probably care about factions, numbers, or both — same here.</p>
  <p>In-game I’m a <strong>merit whore</strong> in the best/worst sense: I’m chasing every award I can, and I’m trying to pop as much Xanax as I can while I’m at it. When I’m not up against API limits, I’m usually tweaking an algorithm on how to get all the awards faster.</p>
  <p class="about-footer muted">Thanks for stopping by. Good luck in the city.</p>
</div>`;
    res.type('html').send(layout('About', 'about', body));
});

app.get('/', async (req, res) => {
    const files = await listSqlBasenames();
    const exportLinks = files.length
        ? `<ul>${files.map((f) => `<li><a href="/exports/view/${encodeURIComponent(f)}">${escapeHtml(f)}</a></li>`).join('')}</ul>`
        : '<p class="msg-ok">No <code>.sql</code> files yet. Run an API to create exports under <code>exports/</code>.</p>';
    const body = `
<h1>Home</h1>
<div class="card">
  <p>Docs: <a href="/readme">README</a> · <a href="/release-notes">Release notes</a> · <a href="/about">About</a></p>
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
${apiBackRow('/api/random', 'Search again')}
<p class="msg-ok">Appended row. File: <a href="/exports/view/${encodeURIComponent(base)}">${escapeHtml(out.path)}</a></p>
<div class="card"><pre class="pre">${escapeHtml(JSON.stringify(out, null, 2))}</pre></div>`;
        res.type('html').send(layout('Random result', 'random', body));
    } catch (err) {
        const body = `<h1>Random ranked — error</h1>${apiBackRow('/api/random', 'Search again')}<p class="msg-err">${escapeHtml(err.message || err)}</p>`;
        res.status(500).type('html').send(layout('Error', 'random', body));
    }
});

app.get('/api/by-id', (req, res) => {
    const raw = req.query.playerId ?? req.query.q ?? '';
    const prefill = String(raw).trim();
    const safeVal = prefill ? escapeHtml(prefill) : '';
    const body = `
<h1>Player by ID</h1>
<form method="post" action="/api/by-id/run" class="card">
  <label>Player ID</label><input name="playerId" required value="${safeVal}"/>
  <label>SQL path (optional)</label><input name="sqlPath" placeholder="default exports path"/>
  <button type="submit">Fetch &amp; append SQL</button>
</form>`;
    res.type('html').send(layout('Player by ID', 'byid', body));
});

app.post('/api/by-id/run', async (req, res) => {
    const { playerId, sqlPath } = req.body;
    if (playerId == null || String(playerId).trim() === '') {
        res.status(400).type('html').send(layout('Error', 'byid', `${apiBackRow('/api/by-id', 'Search again')}<p class="msg-err">playerId required</p>`));
        return;
    }
    const opts = sqlPath && String(sqlPath).trim() ? { sqlPath: String(sqlPath).trim() } : {};
    try {
        const out = await exportPlayerByIdToSql(playerId, opts);
        const base = path.basename(out.path);
        const body = `
<h1>Player by ID — result</h1>
${apiBackRow('/api/by-id', 'Search again')}
<p class="msg-ok">Appended row. File: <a href="/exports/view/${encodeURIComponent(base)}">${escapeHtml(out.path)}</a></p>
<div class="card"><pre class="pre">${escapeHtml(JSON.stringify(out, null, 2))}</pre></div>`;
        res.type('html').send(layout('By ID result', 'byid', body));
    } catch (err) {
        const body = `<h1>Player by ID — error</h1>${apiBackRow('/api/by-id', 'Search again')}<p class="msg-err">${escapeHtml(err.message || err)}</p>`;
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
        res.status(400).type('html').send(layout('Error', 'hof', `${apiBackRow('/api/faction-hof', 'Search again')}<p class="msg-err">hofRank required</p>`));
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
${apiBackRow('/api/faction-hof', 'Search again')}
<p class="msg-ok">Wrote ${escapeHtml(String(out.rowsWritten))} row(s). File: <a href="/exports/view/${encodeURIComponent(base)}">${escapeHtml(out.path)}</a></p>
<div class="card"><pre class="pre">${escapeHtml(JSON.stringify(out, null, 2))}</pre></div>`;
        res.type('html').send(layout('HoF result', 'hof', body));
    } catch (err) {
        const body = `<h1>Faction HoF — error</h1>${apiBackRow('/api/faction-hof', 'Search again')}<p class="msg-err">${escapeHtml(err.message || err)}</p>`;
        res.status(500).type('html').send(layout('Error', 'hof', body));
    }
});

app.listen(PORT, () => {
    console.log(`Botato's Torn Scripts web UI http://localhost:${PORT}`);
});
