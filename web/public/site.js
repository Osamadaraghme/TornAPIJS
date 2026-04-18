/**
 * Bulk-action helpers for the saved-data list and per-file viewer.
 * Inputs/buttons are linked to bulk forms via their `form="..."` attribute,
 * so we query by attribute selector rather than form descendants.
 */
window.bulkSelectAll = function bulkSelectAll(checkbox, formId) {
    const sel = `input[form="${formId}"][type="checkbox"]`;
    document.querySelectorAll(sel).forEach((cb) => { cb.checked = checkbox.checked; });
};
window.confirmBulkSubmit = function confirmBulkSubmit(formId, label) {
    const sel = `input[form="${formId}"]:checked`;
    const n = document.querySelectorAll(sel).length;
    if (n === 0) {
        alert(`Nothing selected. Tick at least one ${label} first.`);
        return false;
    }
    return confirm(`Delete ${n} ${label}? This cannot be undone.`);
};

/**
 * Header quick jump: type to filter pages, Enter to go. Ctrl+K or / focuses.
 * All-digit query adds “Player by ID — {id}” → /api/by-id?playerId=…
 */
(function () {
    const QUICK_PAGES = [
        { href: '/', label: 'Home', keywords: 'start dashboard' },
        { href: '/api/random', label: 'Random ranked', keywords: 'random active roll lottery' },
        { href: '/api/by-id', label: 'Player by ID', keywords: 'by id player lookup profile xid' },
        { href: '/api/faction-hof', label: 'Faction HoF', keywords: 'hof hall fame faction rank' },
        { href: '/exports', label: 'Saved player data', keywords: 'files browse sql export saved player data delete' },
        { href: '/admin/control-panel', label: 'Settings', keywords: 'admin control panel constants api keys scoring' },
        { href: '/readme', label: 'README', keywords: 'docs readme documentation' },
        { href: '/release-notes', label: 'Release notes', keywords: 'changelog releases version' },
        { href: '/about', label: 'About', keywords: 'botato author' },
    ];

    const input = document.getElementById('api-quick-filter');
    const list = document.getElementById('api-quick-results');
    if (!input || !list) return;

    let activeIdx = -1;
    let filtered = [];

    function norm(s) {
        return String(s).toLowerCase().trim();
    }

    function matchesQuery(q, page) {
        if (!q) return true;
        const hay = norm(`${page.label} ${page.keywords}`);
        return q
            .split(/\s+/)
            .filter(Boolean)
            .every((w) => hay.includes(w));
    }

    function buildResults(qRaw) {
        const trimmed = String(qRaw).trim();
        const q = norm(trimmed);
        const out = [];

        if (/^\d{1,12}$/.test(trimmed)) {
            out.push({
                href: `/api/by-id?playerId=${encodeURIComponent(trimmed)}`,
                label: `Player by ID — ${trimmed}`,
            });
        }

        for (const p of QUICK_PAGES) {
            if (matchesQuery(q, p)) {
                out.push({ href: p.href, label: p.label });
            }
        }

        const seen = new Set();
        return out.filter((x) => {
            if (seen.has(x.href)) return false;
            seen.add(x.href);
            return true;
        }).slice(0, 12);
    }

    function render() {
        filtered = buildResults(input.value);
        activeIdx = filtered.length ? 0 : -1;
        list.innerHTML = '';
        if (!filtered.length) {
            list.hidden = true;
            input.setAttribute('aria-expanded', 'false');
            return;
        }
        filtered.forEach((item, i) => {
            const li = document.createElement('li');
            li.setAttribute('role', 'option');
            li.className = `quick-jump-item${i === activeIdx ? ' is-active' : ''}`;
            const a = document.createElement('a');
            a.href = item.href;
            a.textContent = item.label;
            li.appendChild(a);
            list.appendChild(li);
        });
        list.hidden = false;
        input.setAttribute('aria-expanded', 'true');
    }

    function updateActiveClass() {
        list.querySelectorAll('.quick-jump-item').forEach((el, i) => {
            el.classList.toggle('is-active', i === activeIdx);
        });
    }

    function goActive() {
        if (activeIdx < 0 || !filtered[activeIdx]) return;
        window.location.href = filtered[activeIdx].href;
    }

    input.addEventListener('input', render);
    input.addEventListener('focus', render);

    input.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (!list.hidden && filtered.length) {
                activeIdx = Math.min(activeIdx + 1, filtered.length - 1);
                updateActiveClass();
            }
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (!list.hidden && filtered.length) {
                activeIdx = Math.max(activeIdx - 1, 0);
                updateActiveClass();
            }
        } else if (e.key === 'Enter') {
            if (!list.hidden && filtered.length && activeIdx >= 0) {
                e.preventDefault();
                goActive();
            }
        } else if (e.key === 'Escape') {
            list.hidden = true;
            input.setAttribute('aria-expanded', 'false');
            activeIdx = -1;
        }
    });

    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
            e.preventDefault();
            input.focus();
            input.select();
            render();
            return;
        }
        if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
            const t = e.target;
            const tag = t && t.tagName;
            const inField =
                tag === 'TEXTAREA' ||
                tag === 'SELECT' ||
                (tag === 'INPUT' && t.type !== 'button' && t.type !== 'submit' && t.type !== 'checkbox' && t.type !== 'radio');
            if (!inField && !t.isContentEditable) {
                e.preventDefault();
                input.focus();
                input.select();
                render();
            }
        }
    });

    document.addEventListener('mousedown', (e) => {
        const wrap = input.closest('.quick-jump');
        if (wrap && !wrap.contains(e.target)) {
            list.hidden = true;
            input.setAttribute('aria-expanded', 'false');
        }
    });
})();

/**
 * Copy formatted result data to clipboard (API result cards + export viewer per-player rows).
 */
(function () {
    async function copyPlainTextWithButtonFeedback(button, text, doneClass) {
        const orig = button.textContent;
        const restore = () => {
            button.textContent = orig;
            button.classList.remove(doneClass);
            button.disabled = false;
        };
        const ok = () => {
            button.textContent = 'Copied!';
            button.classList.add(doneClass);
            button.disabled = true;
            setTimeout(restore, 2000);
        };
        const fail = () => {
            button.textContent = 'Copy failed';
            setTimeout(restore, 2500);
        };

        try {
            await navigator.clipboard.writeText(text);
            ok();
        } catch {
            try {
                const ta = document.createElement('textarea');
                ta.value = text;
                ta.setAttribute('readonly', '');
                ta.style.position = 'fixed';
                ta.style.left = '-9999px';
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
                ok();
            } catch {
                fail();
            }
        }
    }

    document.addEventListener('click', async (e) => {
        const apiBtn = e.target.closest('.btn-copy-json');
        if (apiBtn) {
            const card = apiBtn.closest('.api-json-card');
            const pre = card?.querySelector('.api-json-pre');
            if (!pre) return;
            await copyPlainTextWithButtonFeedback(apiBtn, pre.textContent ?? '', 'btn-copy-json--done');
            return;
        }
        const playerBtn = e.target.closest('.btn-copy-player-json');
        if (playerBtn) {
            const script = document.getElementById('export-view-rows-json');
            if (!script?.textContent) return;
            let rows;
            try {
                rows = JSON.parse(script.textContent);
            } catch {
                return;
            }
            if (!Array.isArray(rows)) return;
            const idx = Number(playerBtn.getAttribute('data-player-row'));
            if (!Number.isInteger(idx) || idx < 0 || idx >= rows.length) return;
            const text = JSON.stringify(rows[idx], null, 2);
            await copyPlainTextWithButtonFeedback(playerBtn, text, 'btn-copy-player-json--done');
        }
    });
})();

/**
 * Saved player data viewer: reorder player columns by dragging the ≡ handle in each header.
 * DOM-only (refresh restores server order). Row indices for delete / Copy data move with the column.
 */
(function initExportViewColumnReorder() {
    let columnDragActive = false;
    let dragSourceTh = null;
    let dragSourceIdx = null;
    let dragTargetTh = null;
    let dragDropAfter = false;

    function clearDropHighlights(table) {
        if (!table) return;
        table.querySelectorAll('thead .th-record--drop-target, thead .th-record--drop-before, thead .th-record--drop-after').forEach((el) => {
            el.classList.remove('th-record--drop-target');
            el.classList.remove('th-record--drop-before');
            el.classList.remove('th-record--drop-after');
        });
    }

    function clearColumnClass(table, className) {
        if (!table || !className) return;
        table.querySelectorAll(`.${className}`).forEach((el) => el.classList.remove(className));
    }

    function markColumnByCellIndex(table, cellIndex, className) {
        if (!table || !Number.isInteger(cellIndex) || cellIndex < 1) return;
        const theadRow = table.tHead?.rows[0];
        const tbody = table.tBodies[0];
        if (!theadRow || !tbody) return;
        const max = theadRow.cells.length - 1;
        if (cellIndex > max) return;
        const rows = [theadRow, ...Array.from(tbody.rows)];
        for (const tr of rows) {
            const cell = tr.cells[cellIndex];
            if (cell) cell.classList.add(className);
        }
    }

    function setDragCursorState(on) {
        document.body.classList.toggle('export-col-drag-active', Boolean(on));
    }

    /**
     * Move a player column to a target insertion point (0..N in player-only coordinates),
     * where 0 is first player column and N means "insert at end / become last".
     */
    function reorderPlayerColumns(table, fromIdx, insertAtPlayerIdx) {
        if (fromIdx < 1) return;
        const theadRow = table.tHead?.rows[0];
        const tbody = table.tBodies[0];
        if (!theadRow || !tbody) return;
        const max = theadRow.cells.length - 1;
        if (fromIdx > max) return;

        const from = fromIdx - 1;
        const playerCount = max;
        if (!Number.isInteger(insertAtPlayerIdx) || insertAtPlayerIdx < 0 || insertAtPlayerIdx > playerCount) return;
        let insertAt = insertAtPlayerIdx;
        if (from < insertAt) insertAt -= 1;
        if (from === insertAt) return;

        const rows = [theadRow, ...Array.from(tbody.rows)];
        for (const tr of rows) {
            const playerCells = [];
            while (tr.cells.length > 1) {
                playerCells.push(tr.removeChild(tr.cells[1]));
            }
            const item = playerCells.splice(from, 1)[0];
            if (!item) continue;
            playerCells.splice(insertAt, 0, item);
            for (const c of playerCells) {
                tr.appendChild(c);
            }
        }
    }

    document.addEventListener('dragstart', (e) => {
        const handle = e.target.closest('.th-record-drag-handle');
        if (!handle) return;
        const table = handle.closest('table.export-table-transposed');
        if (!table) return;
        const th = handle.closest('thead th.th-record');
        if (!th) return;
        columnDragActive = true;
        dragSourceTh = th;
        dragSourceIdx = th.cellIndex;
        dragTargetTh = null;
        dragDropAfter = false;
        th.classList.add('th-record--dragging');
        markColumnByCellIndex(table, dragSourceIdx, 'col-drag-source');
        setDragCursorState(true);
        const idx = th.cellIndex;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(idx));
    });

    document.addEventListener('dragend', () => {
        if (!dragSourceTh) return;
        const table = dragSourceTh.closest('table.export-table-transposed');
        dragSourceTh.classList.remove('th-record--dragging');
        dragSourceTh = null;
        dragSourceIdx = null;
        dragTargetTh = null;
        dragDropAfter = false;
        columnDragActive = false;
        clearDropHighlights(table);
        clearColumnClass(table, 'col-drag-source');
        clearColumnClass(table, 'col-drop-target-before');
        clearColumnClass(table, 'col-drop-target-after');
        setDragCursorState(false);
    });

    document.addEventListener('dragover', (e) => {
        if (!columnDragActive) return;
        const table = e.target.closest('table.export-table-transposed');
        if (!table) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        clearDropHighlights(table);
        clearColumnClass(table, 'col-drop-target-before');
        clearColumnClass(table, 'col-drop-target-after');
        const th = e.target.closest('thead th.th-record');
        if (th && table.contains(th)) {
            const rect = th.getBoundingClientRect();
            const dropAfter = e.clientX > (rect.left + rect.width / 2);
            dragTargetTh = th;
            dragDropAfter = dropAfter;
            th.classList.add('th-record--drop-target');
            th.classList.add(dropAfter ? 'th-record--drop-after' : 'th-record--drop-before');
            markColumnByCellIndex(table, th.cellIndex, dropAfter ? 'col-drop-target-after' : 'col-drop-target-before');
        }
    });

    document.addEventListener('drop', (e) => {
        if (!columnDragActive) return;
        const th = e.target.closest('thead th.th-record');
        const table = th?.closest('table.export-table-transposed');
        if (!table || !th) return;
        e.preventDefault();
        let fromIdx = Number.parseInt(e.dataTransfer.getData('text/plain'), 10);
        if (!Number.isFinite(fromIdx)) {
            fromIdx = Number.parseInt(e.dataTransfer.getData('application/x-export-col'), 10);
        }
        const toIdx = th.cellIndex;
        const toPlayerIdx = toIdx - 1;
        const dropAfter = (dragTargetTh === th) ? dragDropAfter : (e.clientX > (th.getBoundingClientRect().left + th.getBoundingClientRect().width / 2));
        const insertAtPlayerIdx = dropAfter ? (toPlayerIdx + 1) : toPlayerIdx;
        clearDropHighlights(table);
        clearColumnClass(table, 'col-drop-target-before');
        clearColumnClass(table, 'col-drop-target-after');
        if (Number.isFinite(fromIdx) && Number.isFinite(toIdx) && Number.isFinite(insertAtPlayerIdx)) {
            reorderPlayerColumns(table, fromIdx, insertAtPlayerIdx);
        }
        columnDragActive = false;
        if (dragSourceTh) {
            dragSourceTh.classList.remove('th-record--dragging');
            dragSourceTh = null;
        }
        dragSourceIdx = null;
        dragTargetTh = null;
        dragDropAfter = false;
        clearColumnClass(table, 'col-drag-source');
        setDragCursorState(false);
    });
})();

/**
 * Saved player data viewer: sort player columns by key metrics.
 * Sort acts on visual columns only (file order is unchanged unless rows are rewritten elsewhere).
 */
(function initExportViewSortControls() {
    function getRowsData() {
        const script = document.getElementById('export-view-rows-json');
        if (!script?.textContent) return null;
        try {
            const rows = JSON.parse(script.textContent);
            return Array.isArray(rows) ? rows : null;
        } catch {
            return null;
        }
    }

    function currentOriginalOrderFromHeader(theadRow) {
        return Array.from(theadRow.cells)
            .slice(1)
            .map((th) => {
                const btn = th.querySelector('.btn-copy-player-json');
                const raw = btn?.getAttribute('data-player-row');
                const n = Number(raw);
                return Number.isInteger(n) && n >= 0 ? n : null;
            })
            .filter((n) => n != null);
    }

    function reorderTableByOriginalOrder(table, desiredOriginalOrder) {
        const theadRow = table.tHead?.rows[0];
        const tbody = table.tBodies[0];
        if (!theadRow || !tbody || !Array.isArray(desiredOriginalOrder) || desiredOriginalOrder.length === 0) return;

        const currentOrder = currentOriginalOrderFromHeader(theadRow);
        if (currentOrder.length !== desiredOriginalOrder.length) return;
        const rows = [theadRow, ...Array.from(tbody.rows)];
        for (const tr of rows) {
            const playerCells = [];
            while (tr.cells.length > 1) {
                playerCells.push(tr.removeChild(tr.cells[1]));
            }
            const reorderedCells = [];
            for (const origIdx of desiredOriginalOrder) {
                const pos = currentOrder.indexOf(origIdx);
                if (pos >= 0 && playerCells[pos]) reorderedCells.push(playerCells[pos]);
            }
            for (const c of reorderedCells) tr.appendChild(c);
        }
    }

    function toSortableNumber(v) {
        const n = Number(v);
        return Number.isFinite(n) ? n : Number.NEGATIVE_INFINITY;
    }

    function buildSortedOriginalOrder(rows, key) {
        const withOriginal = rows.map((row, idx) => ({ idx, row }));
        withOriginal.sort((a, b) => {
            const av = toSortableNumber(a.row?.[key]);
            const bv = toSortableNumber(b.row?.[key]);
            if (bv !== av) return bv - av;
            return a.idx - b.idx;
        });
        return withOriginal.map((x) => x.idx);
    }

    const applyBtn = document.getElementById('export-player-sort-apply');
    const resetBtn = document.getElementById('export-player-sort-reset');
    const select = document.getElementById('export-player-sort-key');
    const table = document.querySelector('table.export-table-transposed');
    if (!applyBtn || !resetBtn || !select || !table) return;

    applyBtn.addEventListener('click', () => {
        const rows = getRowsData();
        if (!rows || rows.length < 2) return;
        const key = select.value || 'combinedScore';
        const desiredOrder = buildSortedOriginalOrder(rows, key);
        reorderTableByOriginalOrder(table, desiredOrder);
    });

    resetBtn.addEventListener('click', () => {
        const rows = getRowsData();
        if (!rows || rows.length < 2) return;
        const originalOrder = rows.map((_, idx) => idx);
        reorderTableByOriginalOrder(table, originalOrder);
    });
})();
