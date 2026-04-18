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
const { decodeHtmlEntities } = require(path.join(__dirname, '..', 'src', 'utils', 'sql-append.js'));
const {
    deleteExportedPlayerRowByIndex,
    deleteExportedPlayerRowsByIndices,
    clearAllExportedPlayerRows,
    refreshExportedPlayerRowByIndex,
} = require(path.join(__dirname, 'controllers', 'saved-player-export-controller.js'));
const {
    XANAX_PER_DAY_FOR_FULL_SCORE,
    HOURS_PER_DAY_FOR_FULL_TIME_SCORE,
    RECRUITMENT_TIER_XAN_WEIGHT,
    RECRUITMENT_TIER_TIME_WEIGHT,
} = require(path.join(__dirname, '..', 'src', 'constants.js'));

const ROOT = path.join(__dirname, '..');
const EXPORTS_DIR = path.join(ROOT, 'exports');
const PORT = Number(process.env.TORN_WEB_PORT || 3847);

/** Shown in export SQL but omitted from the transposed table (name/IDs in column headers). */
const EXPORT_VIEW_HIDDEN_COLUMNS = new Set(['name', 'playerId', 'factionId', 'companyId']);

/** Field order in export table view: recruiter-first; `recordedAt` above `level` (shown as GMT). */
const RECRUITER_FIELD_ORDER = [
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
    'allTimeEcstasyTaken',
    'ecstasyTakenDuringLastMonth',
    'allTimeRankedWarHits',
    'rankedWarHitsDuringLastMonth',
    'rankedWarsParticipatedLastMonth',
    'timePlayed',
    'timePlayedUntilLastMonth',
    'timePlayedDuringLastMonth',
    'periodUsed',
    'xanaxMode',
    'tornApiCallsUsed',
];

const FIELD_LABELS = {
    lastUpdatedAgo: 'Data last updated',
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
    allTimeEcstasyTaken: 'All-time Ecstasy taken',
    ecstasyTakenDuringLastMonth: 'Ecstasy last month',
    allTimeRankedWarHits: 'All-time ranked war hits',
    rankedWarHitsDuringLastMonth: 'Ranked war hits (last month)',
    rankedWarsParticipatedLastMonth: 'Ranked wars participated (last month)',
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

/** JSON safe to embed inside `<script type="application/json">` (breaks `</script>` if raw `<` is allowed). */
function jsonForInlineScriptTag(value) {
    return JSON.stringify(value).replace(/</g, '\\u003c');
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
        ['/api/random', 'Random ranked', 'random'],
        ['/api/by-id', 'Player by ID', 'byid'],
        ['/api/faction-hof', 'Faction HoF', 'hof'],
        ['/exports', 'Saved player data', 'exports'],
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
    <a href="/" class="site-brand" aria-label="Home">Botato's Torn Scripts</a>
    <nav class="nav-links" aria-label="Main">${links}</nav>
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

/** Primary action row on API result / error pages (above the full result block). */
function apiBackRow(href, label = 'Search again') {
    return `<p class="api-result-actions"><a class="btn" href="${escapeHtml(href)}">${escapeHtml(label)}</a></p>`;
}

/** Pretty-printed API result + copy control for HTML result pages (Random / By ID / HoF). */
function renderApiJsonResultBlock(obj) {
    return `<div class="card api-json-card">
  <div class="api-json-toolbar">
    <button type="button" class="btn btn-copy-json" aria-label="Copy all result data to clipboard">Copy data</button>
  </div>
  <pre class="pre api-json-pre">${escapeHtml(JSON.stringify(obj, null, 2))}</pre>
</div>`;
}

function orderColumnsForRecruiterView(columns) {
    const colSet = new Set(columns);
    const knownOrdered = RECRUITER_FIELD_ORDER.filter((f) => colSet.has(f));
    const knownSet = new Set(knownOrdered);
    const extras = columns.filter((c) => !knownSet.has(c));
    return [...knownOrdered, ...extras];
}

/** Viewer-only row derived from `recordedAt`; inserted before that column (not in SQL). */
function orderedColumnsWithLastUpdateRow(orderedColumns) {
    const base = orderedColumns.filter((c) => c !== 'lastUpdatedAgo');
    const idx = base.indexOf('recordedAt');
    if (idx >= 0) {
        const out = [...base];
        out.splice(idx, 0, 'lastUpdatedAgo');
        return out;
    }
    return [...base, 'lastUpdatedAgo'];
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

function formatLastUpdatedAgoHtml(rawRecordedAt) {
    if (rawRecordedAt === null || rawRecordedAt === undefined) {
        return '<span class="cell-null">NULL</span>';
    }
    const s = String(rawRecordedAt).trim();
    if (!s) return '<span class="cell-null">NULL</span>';
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) {
        return '<span class="cell-str">—</span>';
    }
    const diffSec = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
    const title = ` title="${escapeHtml(s)}"`;
    if (diffSec < 60) return `<span class="cell-str cell-last-update"${title}>just now</span>`;
    if (diffSec < 3600) {
        const m = Math.floor(diffSec / 60);
        return `<span class="cell-str cell-last-update"${title}>${m} min ago</span>`;
    }
    if (diffSec < 86400) {
        const h = Math.floor(diffSec / 3600);
        return `<span class="cell-str cell-last-update"${title}>${h} hour${h === 1 ? '' : 's'} ago</span>`;
    }
    const days = Math.floor(diffSec / 86400);
    return `<span class="cell-str cell-last-update"${title}>${days} day${days === 1 ? '' : 's'} ago</span>`;
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
    const v = col === 'lastUpdatedAgo' ? row.recordedAt : row[col];
    if (col === 'lastUpdatedAgo') {
        return formatLastUpdatedAgoHtml(row.recordedAt);
    }
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

function renderPlayerStatsTable(parsed, sqlBasename, options = {}) {
    const { columns, rows } = parsed;
    const { bulkRowsFormId = null } = options;
    const visibleColumns = columns.filter((c) => !EXPORT_VIEW_HIDDEN_COLUMNS.has(c));
    const orderedColumns = orderedColumnsWithLastUpdateRow(orderColumnsForRecruiterView(visibleColumns));
    const deleteAction = `/exports/view/${encodeURIComponent(sqlBasename)}/delete-row`;
    const updateAction = `/exports/view/${encodeURIComponent(sqlBasename)}/update-row`;
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
        const nameLine =
            nameInner !== ''
                ? url && r.playerId != null
                    ? `<span class="th-record-nameline"><a class="cell-link th-profile-link th-record-name-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${nameInner}</a></span>`
                    : `<span class="th-record-nameline">${nameInner}</span>`
                : '';
        const idLine = `<span class="th-record-idline">${idBlock}</span>`;
        const whoBlock =
            nameInner !== ''
                ? `<div class="th-record-who">${nameLine}${idLine}</div>`
                : `<div class="th-record-who th-record-who-id-only">${idLine}</div>`;
        const checkboxBlock = bulkRowsFormId
            ? `<label class="th-record-checkbox" title="Select for bulk delete">
                  <input type="checkbox" form="${escapeHtml(bulkRowsFormId)}" name="rowIndex" value="${i}" aria-label="Select record ${i + 1}"/>
              </label>`
            : '';
        const dragHandle =
            '<span class="th-record-drag-handle" draggable="true" title="Drag to reorder columns" aria-label="Drag to reorder columns">≡</span>';
        const actionsBlock = `<div class="th-record-actions">
  <form class="form-update-row" method="post" action="${escapeHtml(updateAction)}" onsubmit="return confirm('Update this player from Torn API now?');">
    <input type="hidden" name="rowIndex" value="${i}"/>
    <button type="submit" class="btn-update">Update</button>
  </form>
  <button type="button" class="btn btn-copy-player-json btn-copy-player-data" data-player-row="${i}" title="Copy everything saved for this player (paste into a note, email, or spreadsheet)" aria-label="Copy this player’s saved data">Copy data</button>
  <form class="form-delete-row" method="post" action="${escapeHtml(deleteAction)}" onsubmit="return confirm('Remove this row from the SQL file?');">
    <input type="hidden" name="rowIndex" value="${i}"/>
    <button type="submit" class="btn-delete">Delete</button>
  </form>
</div>`;
        const headBlock = `<div class="th-record-head">
  <div class="th-record-head-primary">${dragHandle}${checkboxBlock}${whoBlock}</div>
  ${actionsBlock}
</div>`;
        headerCells.push(`<th scope="col" class="th-record">${headBlock}</th>`);
    }
    const bodyRows = orderedColumns
        .map((col) => {
            const fieldCell = `<th scope="row" class="field-name">${escapeHtml(fieldLabelForColumn(col))}</th>`;
            const cells = rows
                .map((row) => {
                    const v = col === 'lastUpdatedAgo' ? row.recordedAt : row[col];
                    const tdCls = TIME_PLAYED_SECONDS_COLUMNS.has(col) ? 'td-str' : cellTdClass(v);
                    return `<td class="${tdCls}">${formatTransposedDataCell(col, row)}</td>`;
                })
                .join('');
            return `<tr>${fieldCell}${cells}</tr>`;
        })
        .join('');
    const rowsJson = jsonForInlineScriptTag(rows);
    return `<div class="table-scroll table-scroll-transposed" role="region" aria-label="Export data" tabindex="0">
<table class="export-table export-table-transposed">
<thead><tr>${headerCells.join('')}</tr></thead>
<tbody>${bodyRows}</tbody>
</table>
</div>
<script type="application/json" id="export-view-rows-json">${rowsJson}</script>`;
}

async function listSqlBasenames() {
    try {
        const names = await fsp.readdir(EXPORTS_DIR);
        return names.filter((n) => n.endsWith('.sql')).sort();
    } catch {
        return [];
    }
}

/** Same files as `listSqlBasenames`, with size + mtime for the listing UI. */
async function listSqlExportEntries() {
    const names = await listSqlBasenames();
    const entries = await Promise.all(
        names.map(async (name) => {
            try {
                const st = await fsp.stat(path.join(EXPORTS_DIR, name));
                return { name, sizeBytes: st.size, mtimeMs: st.mtimeMs };
            } catch {
                return { name, sizeBytes: 0, mtimeMs: 0 };
            }
        }),
    );
    return entries;
}

/** Friendly human label for a saved file (drops `.sql`, replaces `-`/`_` with spaces). */
function humanizeSqlFileName(name) {
    const base = name.replace(/\.sql$/i, '');
    return base.replace(/[-_]+/g, ' ').trim() || base;
}

function formatBytes(n) {
    if (!Number.isFinite(n) || n < 0) return '';
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
    return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatRelativeTime(mtimeMs) {
    if (!Number.isFinite(mtimeMs) || mtimeMs <= 0) return '';
    const diffSec = Math.max(0, (Date.now() - mtimeMs) / 1000);
    if (diffSec < 60) return 'just now';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)} min ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} h ago`;
    if (diffSec < 86400 * 30) return `${Math.floor(diffSec / 86400)} day(s) ago`;
    const d = new Date(mtimeMs);
    return d.toISOString().slice(0, 10);
}

/** Render the "saved player data" file list as cards (used by `/` and `/exports`). */
function renderSavedDataList(entries, options = {}) {
    const { compact = false, bulkFormId = null } = options;
    if (!entries.length) {
        return '<p class="saved-empty">No saved player data files yet. Run an API to create one.</p>';
    }
    return `<ul class="saved-data-list">${entries
        .map((e) => {
            const enc = encodeURIComponent(e.name);
            const human = humanizeSqlFileName(e.name);
            const checkbox = !compact && bulkFormId
                ? `<label class="bulk-checkbox-cell" title="Select for bulk delete">
                       <input type="checkbox" form="${escapeHtml(bulkFormId)}" name="fileNames" value="${escapeHtml(e.name)}" class="bulk-checkbox" aria-label="Select ${escapeHtml(e.name)}"/>
                   </label>`
                : '';
            const meta = compact
                ? ''
                : `<span class="saved-data-meta">${escapeHtml(formatRelativeTime(e.mtimeMs))}`
                + ` <span class="sep">·</span> ${escapeHtml(formatBytes(e.sizeBytes))}</span>`;
            const deleteBtn = compact
                ? ''
                : `<form method="post" action="/exports/delete/${enc}" class="saved-data-delete-form"
                       onsubmit="return confirm('Delete &quot;${escapeHtml(e.name).replace(/'/g, "\\'")}&quot;? This cannot be undone.');">
                       <button type="submit" class="btn-danger" aria-label="Delete ${escapeHtml(e.name)}">Delete</button>
                   </form>`;
            return `<li class="saved-data-row">
                ${checkbox}
                <a class="saved-data-link" href="/exports/view/${enc}">
                    <span class="saved-data-name">${escapeHtml(human)}</span>
                    <span class="saved-data-ext">${escapeHtml(e.name)}</span>
                </a>
                ${meta}
                ${deleteBtn}
            </li>`;
        })
        .join('')}</ul>`;
}

function safeSqlBasename(raw) {
    if (raw == null || typeof raw !== 'string') return null;
    const base = path.basename(raw);
    if (!/^[a-zA-Z0-9._-]+\.sql$/i.test(base)) return null;
    return base;
}

/**
 * Normalize the optional "SQL file name" input on API forms.
 * Users supply a bare name (no extension); we always save under `exports/`
 * with a `.sql` extension. A trailing `.sql` is tolerated so power users
 * pasting `foo.sql` still get the same result as `foo`.
 *
 * @returns {{ provided: false } | { provided: true, ok: true, fullPath: string }
 *           | { provided: true, ok: false, error: string }}
 */
function normalizeUserSqlName(raw) {
    if (raw == null) return { provided: false };
    const s = String(raw).trim();
    if (s === '') return { provided: false };
    const baseRaw = path.basename(s);
    const base = baseRaw.replace(/\.sql$/i, '');
    if (!/^[a-zA-Z0-9._-]+$/.test(base)) {
        return {
            provided: true,
            ok: false,
            error: 'Invalid SQL file name. Use only letters, numbers, dot, dash, underscore '
                + '(no slashes, no extension — `.sql` is added automatically).',
        };
    }
    return { provided: true, ok: true, fullPath: path.join(EXPORTS_DIR, `${base}.sql`) };
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
    const entries = await listSqlExportEntries();
    const list = renderSavedDataList(entries, { compact: true });
    const body = `
<h1>Home</h1>
<div class="card">
  <p>Docs: <a href="/readme">README</a> · <a href="/release-notes">Release notes</a> · <a href="/about">About</a></p>
  <p>Run the three recruitment APIs from their pages. Saved player data appears under <a href="/exports">Saved player data</a>.</p>
  <p><a class="btn" href="/api/random">Random active ranked</a>
  <a class="btn" href="/api/by-id">Player by ID</a>
  <a class="btn" href="/api/faction-hof">Faction HoF</a></p>
</div>
<div class="card">
  <h2>Saved player data</h2>
  <p><a href="/exports">Open the full list (with delete)</a></p>
  ${list}
</div>`;
    res.type('html').send(layout("Botato's Torn Scripts", 'home', body));
});

app.get('/exports', async (req, res) => {
    const entries = await listSqlExportEntries();
    let flash = '';
    if (req.query.deleted) {
        flash = `<p class="msg-ok">Deleted <code>${escapeHtml(String(req.query.deleted))}</code>.</p>`;
    } else if (req.query.deletedCount) {
        const n = String(req.query.deletedCount);
        flash = `<p class="msg-ok">Deleted ${escapeHtml(n)} file(s).</p>`;
    } else if (req.query.deletedAll) {
        flash = `<p class="msg-ok">Deleted all saved files.</p>`;
    }
    const bulkFormId = 'bulk-files-form';
    const list = renderSavedDataList(entries, { bulkFormId });
    const bulkForms = entries.length
        ? `<form id="${bulkFormId}" method="post" action="/exports/delete-bulk"></form>
<form id="delete-all-files-form" method="post" action="/exports/delete-all"
      onsubmit="return confirm('Delete ALL ${entries.length} saved file(s)? This cannot be undone.') && confirm('Are you absolutely sure? This wipes every file in exports/.');"></form>`
        : '';
    const bulkBar = entries.length
        ? `<div class="bulk-toolbar">
  <label class="bulk-toggle">
    <input type="checkbox" onclick="bulkSelectAll(this,'${bulkFormId}')" aria-label="Select all files"/>
    <span>Select all</span>
  </label>
  <button type="submit" form="${bulkFormId}" class="btn-danger"
          onclick="return confirmBulkSubmit('${bulkFormId}','file(s)');">Delete checked</button>
  <span class="bulk-spacer"></span>
  <button type="submit" form="delete-all-files-form" class="btn-danger-strong">Delete all files</button>
</div>`
        : '';
    const body = `
<h1>Saved player data</h1>
${flash}
${bulkForms}
<div class="card">
  <p class="muted saved-data-intro">Each row is one of your saved player-data files. Tick boxes to select files, or click a name to open one. Use <strong>Delete</strong> on a row, <strong>Delete checked</strong> for a multi-select, or <strong>Delete all files</strong> to wipe everything.</p>
  ${bulkBar}
  ${list}
</div>`;
    res.type('html').send(layout('Saved player data', 'exports', body));
});

app.post('/exports/delete/:file', async (req, res) => {
    const base = safeSqlBasename(req.params.file);
    if (!base) {
        res.status(400).type('html').send(layout('Bad file', 'exports', '<p class="msg-err">Invalid file name.</p>'));
        return;
    }
    const full = resolvedExportPath(base);
    if (!full) {
        res.status(400).type('html').send(layout('Bad file', 'exports', '<p class="msg-err">Invalid file path.</p>'));
        return;
    }
    try {
        await fsp.unlink(full);
    } catch (err) {
        if (err && err.code !== 'ENOENT') {
            const msg = `Could not delete <code>${escapeHtml(base)}</code>: ${escapeHtml(err.message || String(err))}`;
            res.status(500).type('html').send(layout('Delete failed', 'exports', `<p class="msg-err">${msg}</p>`));
            return;
        }
    }
    res.redirect(303, `/exports?deleted=${encodeURIComponent(base)}`);
});

app.post('/exports/delete-bulk', async (req, res) => {
    const raw = req.body?.fileNames;
    const list = raw == null ? [] : Array.isArray(raw) ? raw : [raw];
    let deleted = 0;
    let errors = [];
    for (const item of list) {
        const base = safeSqlBasename(String(item));
        if (!base) continue;
        const full = resolvedExportPath(base);
        if (!full) continue;
        try {
            await fsp.unlink(full);
            deleted++;
        } catch (err) {
            if (err && err.code !== 'ENOENT') {
                errors.push(`${base}: ${err.message || String(err)}`);
            }
        }
    }
    if (errors.length) {
        const body = `<h1>Bulk delete — partial failure</h1>
<p class="msg-ok">Deleted ${deleted} file(s).</p>
<p class="msg-err">Errors:</p>
<ul>${errors.map((e) => `<li>${escapeHtml(e)}</li>`).join('')}</ul>
<p><a class="btn" href="/exports">Back to saved data</a></p>`;
        res.status(500).type('html').send(layout('Bulk delete', 'exports', body));
        return;
    }
    res.redirect(303, `/exports?deletedCount=${deleted}`);
});

app.post('/exports/delete-all', async (req, res) => {
    let deleted = 0;
    let errors = [];
    try {
        const names = (await fsp.readdir(EXPORTS_DIR)).filter((n) => n.endsWith('.sql'));
        for (const name of names) {
            const base = safeSqlBasename(name);
            if (!base) continue;
            const full = resolvedExportPath(base);
            if (!full) continue;
            try {
                await fsp.unlink(full);
                deleted++;
            } catch (err) {
                if (err && err.code !== 'ENOENT') {
                    errors.push(`${base}: ${err.message || String(err)}`);
                }
            }
        }
    } catch (err) {
        const msg = `Could not read exports directory: ${escapeHtml(err.message || String(err))}`;
        res.status(500).type('html').send(layout('Delete failed', 'exports', `<p class="msg-err">${msg}</p>`));
        return;
    }
    if (errors.length) {
        const body = `<h1>Delete all — partial failure</h1>
<p class="msg-ok">Deleted ${deleted} file(s).</p>
<p class="msg-err">Errors:</p>
<ul>${errors.map((e) => `<li>${escapeHtml(e)}</li>`).join('')}</ul>
<p><a class="btn" href="/exports">Back to saved data</a></p>`;
        res.status(500).type('html').send(layout('Delete all', 'exports', body));
        return;
    }
    res.redirect(303, `/exports?deletedAll=1&deletedCount=${deleted}`);
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
    const del = await deleteExportedPlayerRowByIndex(full, rowIndex);
    if (!del.ok) {
        res.redirect(303, `/exports/view/${encodeURIComponent(base)}`);
        return;
    }
    res.redirect(303, `/exports/view/${encodeURIComponent(base)}`);
});

app.post('/exports/view/:file/delete-rows', async (req, res) => {
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
    const rawIdx = req.body?.rowIndex;
    const rawList = rawIdx == null ? [] : Array.isArray(rawIdx) ? rawIdx : [rawIdx];
    const del = await deleteExportedPlayerRowsByIndices(full, rawList);
    if (!del.ok) {
        res.redirect(303, `/exports/view/${encodeURIComponent(base)}`);
        return;
    }
    res.redirect(303, `/exports/view/${encodeURIComponent(base)}?deletedRows=${del.deletedCount}`);
});

app.post('/exports/view/:file/delete-all-rows', async (req, res) => {
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
    clearAllExportedPlayerRows(full);
    res.redirect(303, `/exports/view/${encodeURIComponent(base)}?clearedAll=1`);
});

app.post('/exports/view/:file/update-row', async (req, res) => {
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
    const upd = await refreshExportedPlayerRowByIndex(full, rowIndex);
    if (!upd.ok) {
        if (upd.code === 'bad_player_id' && upd.message) {
            res.redirect(303, `/exports/view/${encodeURIComponent(base)}?updateErr=${encodeURIComponent(upd.message)}`);
            return;
        }
        if (upd.code === 'api_error' && upd.message) {
            res.redirect(303, `/exports/view/${encodeURIComponent(base)}?updateErr=${encodeURIComponent(upd.message)}`);
            return;
        }
        res.redirect(303, `/exports/view/${encodeURIComponent(base)}`);
        return;
    }
    res.redirect(303, `/exports/view/${encodeURIComponent(base)}?updatedId=${encodeURIComponent(String(upd.playerId))}`);
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
    const allNames = await listSqlBasenames();
    const at = allNames.indexOf(base);
    const prevBase = at > 0 ? allNames[at - 1] : null;
    const nextBase = at >= 0 && at < allNames.length - 1 ? allNames[at + 1] : null;
    const titleName = humanizeSqlFileName(base);

    let flash = '';
    if (req.query.deletedRows) {
        flash = `<p class="msg-ok">Deleted ${escapeHtml(String(req.query.deletedRows))} record(s).</p>`;
    } else if (req.query.clearedAll) {
        flash = `<p class="msg-ok">Cleared all records (file kept with header only).</p>`;
    } else if (req.query.updatedId) {
        flash = `<p class="msg-ok">Updated player <code>#${escapeHtml(String(req.query.updatedId))}</code> from Torn API.</p>`;
    } else if (req.query.updateErr) {
        flash = `<p class="msg-err">Update failed: ${escapeHtml(String(req.query.updateErr))}</p>`;
    }

    const links = `<p class="export-view-links">
  <a href="/exports">All exports</a>
  ${prevBase ? `<a class="btn export-nav-btn" href="/exports/view/${encodeURIComponent(prevBase)}" aria-label="Open previous file">← Previous file</a>` : ''}
  ${nextBase ? `<a class="btn export-nav-btn" href="/exports/view/${encodeURIComponent(nextBase)}" aria-label="Open next file">Next file →</a>` : ''}
</p>`;
    let meta = '';
    let mainBlock;
    let bulkBar = '';
    let bulkForms = '';
    let sortBar = '';

    const bulkRowsFormId = 'bulk-rows-form';
    const useBulk = parsed && !wantRaw && parsed.rows.length > 0;

    if (parsed && !wantRaw) {
        meta = `<p class="export-meta"><span class="row-count">${parsed.rows.length} row${parsed.rows.length === 1 ? '' : 's'}</span></p>`;
        mainBlock = `<div class="card card-table">${renderPlayerStatsTable(parsed, base, { bulkRowsFormId: useBulk ? bulkRowsFormId : null })}</div>`;
        if (parsed.rows.length > 1) {
            sortBar = `<div class="bulk-toolbar sort-toolbar">
  <label class="sort-toolbar-label" for="export-player-sort-key">Sort players by</label>
  <select id="export-player-sort-key" class="sort-toolbar-select" aria-label="Sort players by metric">
    <option value="combinedScore" selected>Combined score (default)</option>
    <option value="averageTimeScore">Avg. time score</option>
    <option value="xanScore">Xan score</option>
    <option value="rankedWarHitsDuringLastMonth">Ranked war hits (last month)</option>
  </select>
  <button type="button" id="export-player-sort-apply" class="btn">Sort players</button>
  <button type="button" id="export-player-sort-reset" class="btn">Reset order</button>
</div>`;
        }
    } else {
        if (parsed && wantRaw) {
            meta = `<p class="export-meta"><a href="${escapeHtml(viewPath)}">Table view</a> — ${parsed.rows.length} row${parsed.rows.length === 1 ? '' : 's'}</p>`;
        } else if (!parsed && !wantRaw) {
            meta = `<p class="export-meta muted">Raw SQL only — file does not match expected <code>INSERT INTO … VALUES</code> shape for table view.</p>`;
        }
        mainBlock = `<div class="card card-raw"><pre class="pre">${escapeHtml(text)}</pre></div>`;
    }

    if (useBulk) {
        const deleteRowsAction = `${viewPath}/delete-rows`;
        const deleteAllRowsAction = `${viewPath}/delete-all-rows`;
        bulkForms = `<form id="${bulkRowsFormId}" method="post" action="${escapeHtml(deleteRowsAction)}"></form>
<form id="delete-all-rows-form" method="post" action="${escapeHtml(deleteAllRowsAction)}"
      onsubmit="return confirm('Delete ALL ${parsed.rows.length} record(s) in this file? The file will be kept (header only).');"></form>`;
        bulkBar = `<div class="bulk-toolbar bulk-toolbar-records">
  <label class="bulk-toggle">
    <input type="checkbox" onclick="bulkSelectAll(this,'${bulkRowsFormId}')" aria-label="Select all records"/>
    <span>Select all records</span>
  </label>
  <button type="submit" form="${bulkRowsFormId}" class="btn-danger"
          onclick="return confirmBulkSubmit('${bulkRowsFormId}','record(s)');">Delete checked records</button>
  <span class="bulk-spacer"></span>
  <button type="submit" form="delete-all-rows-form" class="btn-danger-strong">Delete all records</button>
</div>`;
    }

    const toolbar = `<div class="export-toolbar">${links}${meta}</div>`;
    const body = `
<h1>${escapeHtml(titleName)}</h1>
${flash}
${bulkForms}
${toolbar}
${bulkBar}
${sortBar}
${mainBlock}`;
    res.type('html').send(layout(titleName, 'exports', body, 'page-export-sql'));
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
    <div><label>SQL file name (optional)</label><input name="sqlPath" placeholder="e.g. test → exports/test.sql"/></div>
  </div>
  <button type="submit">Run &amp; append SQL</button>
</form>`;
    res.type('html').send(layout('Random ranked', 'random', body));
});

app.post('/api/random/run', async (req, res) => {
    const o = req.body;
    const sqlName = normalizeUserSqlName(o.sqlPath);
    if (sqlName.provided && !sqlName.ok) {
        const body = `<h1>Random ranked — error</h1>${apiBackRow('/api/random', 'Search again')}<p class="msg-err">${escapeHtml(sqlName.error)}</p>`;
        res.status(400).type('html').send(layout('Error', 'random', body));
        return;
    }
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
        ...(sqlName.provided ? { sqlPath: sqlName.fullPath } : {}),
    };
    try {
        const apiKey = process.env.TORN_API_KEY;
        const out = await exportRandomActivePlayerToSql(apiKey, opts);
        const base = path.basename(out.path);
        const body = `
<h1>Random ranked — result</h1>
${apiBackRow('/api/random', 'Search again')}
<p class="msg-ok">Appended row. File: <a href="/exports/view/${encodeURIComponent(base)}">${escapeHtml(out.path)}</a></p>
${renderApiJsonResultBlock(out)}`;
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
  <label>SQL file name (optional)</label><input name="sqlPath" placeholder="e.g. test → exports/test.sql"/>
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
    const sqlName = normalizeUserSqlName(sqlPath);
    if (sqlName.provided && !sqlName.ok) {
        const body = `<h1>Player by ID — error</h1>${apiBackRow('/api/by-id', 'Search again')}<p class="msg-err">${escapeHtml(sqlName.error)}</p>`;
        res.status(400).type('html').send(layout('Error', 'byid', body));
        return;
    }
    const opts = sqlName.provided ? { sqlPath: sqlName.fullPath } : {};
    try {
        const out = await exportPlayerByIdToSql(playerId, opts);
        const base = path.basename(out.path);
        const body = `
<h1>Player by ID — result</h1>
${apiBackRow('/api/by-id', 'Search again')}
<p class="msg-ok">Appended row. File: <a href="/exports/view/${encodeURIComponent(base)}">${escapeHtml(out.path)}</a></p>
${renderApiJsonResultBlock(out)}`;
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
  <label>SQL file name (optional)</label><input name="sqlPath" placeholder="e.g. test → exports/test.sql"/>
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
    const sqlName = normalizeUserSqlName(sqlPath);
    if (sqlName.provided && !sqlName.ok) {
        const body = `<h1>Faction HoF — error</h1>${apiBackRow('/api/faction-hof', 'Search again')}<p class="msg-err">${escapeHtml(sqlName.error)}</p>`;
        res.status(400).type('html').send(layout('Error', 'hof', body));
        return;
    }
    const opts = {};
    if (maxPlayers !== '' && maxPlayers != null) opts.maxPlayers = Number(maxPlayers);
    if (sqlName.provided) opts.sqlPath = sqlName.fullPath;
    try {
        const out = await exportFactionByHofRankToSql(hofRank, opts);
        const base = path.basename(out.path);
        const body = `
<h1>Faction HoF — result</h1>
${apiBackRow('/api/faction-hof', 'Search again')}
<p class="msg-ok">Wrote ${escapeHtml(String(out.rowsWritten))} row(s). File: <a href="/exports/view/${encodeURIComponent(base)}">${escapeHtml(out.path)}</a></p>
${renderApiJsonResultBlock(out)}`;
        res.type('html').send(layout('HoF result', 'hof', body));
    } catch (err) {
        const body = `<h1>Faction HoF — error</h1>${apiBackRow('/api/faction-hof', 'Search again')}<p class="msg-err">${escapeHtml(err.message || err)}</p>`;
        res.status(500).type('html').send(layout('Error', 'hof', body));
    }
});

app.listen(PORT, () => {
    console.log(`Botato's Torn Scripts web UI http://localhost:${PORT}`);
});
