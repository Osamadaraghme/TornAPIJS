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
        { href: '/exports', label: 'SQL exports', keywords: 'files browse sql export' },
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
