/**
 * First-run wizard: POST JSON to /api/first-run/complete.
 */
(function () {
    const form = document.getElementById('first-run-form');
    const keyList = document.getElementById('fr-key-list');
    const addKeyBtn = document.getElementById('fr-key-add');
    const submitBtn = document.getElementById('fr-submit');
    const statusEl = document.getElementById('fr-status');
    const secretHdrInput = document.getElementById('fr-secret-hdr');
    const API_KEY_LEN = 16;

    if (!form || !keyList || !addKeyBtn || !submitBtn) return;

    function setStatus(msg, isErr) {
        statusEl.textContent = msg || '';
        statusEl.className = isErr ? 'admin-status admin-status-err' : 'admin-status admin-status-ok';
    }

    function addKeyRow(value) {
        const row = document.createElement('div');
        row.className = 'api-key-row';
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.className = 'api-key-input';
        inp.spellcheck = false;
        inp.autocomplete = 'off';
        inp.placeholder = `${API_KEY_LEN}-character key`;
        inp.maxLength = 32;
        inp.value = value == null ? '' : String(value).trim();
        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'btn btn-danger api-key-remove';
        del.textContent = 'Remove';
        row.appendChild(inp);
        row.appendChild(del);
        del.addEventListener('click', () => row.remove());
        keyList.appendChild(row);
    }

    addKeyBtn.addEventListener('click', () => addKeyRow(''));

    function collectKeys() {
        const rows = keyList.querySelectorAll('.api-key-row input');
        const out = [];
        for (const inp of rows) {
            const t = String(inp.value || '').trim();
            if (t) out.push(t);
        }
        return out;
    }

    async function refreshStatus() {
        try {
            const r = await fetch('/api/first-run/status');
            const j = await r.json();
            if (!j.required) {
                window.location.href = '/';
            }
        } catch {
            /* ignore */
        }
    }

    form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        setStatus('');
        submitBtn.disabled = true;
        try {
            const st = await fetch('/api/first-run/status').then((x) => x.json());
            const profileEl = document.getElementById('fr-profile');
            const tokenEl = document.getElementById('fr-token');
            const token2El = document.getElementById('fr-token2');
            const body = {
                adminProfile: profileEl && !profileEl.disabled ? String(profileEl.value || '').trim() : undefined,
            };
            if (!st.usesEnvAdminToken) {
                body.adminToken = tokenEl ? String(tokenEl.value || '') : '';
                body.adminTokenConfirm = token2El ? String(token2El.value || '') : '';
            }
            const keys = collectKeys();
            if (keys.length) body.TORN_PUBLIC_API_KEYS = keys;

            const headers = { 'Content-Type': 'application/json' };
            if (st.firstRunSecretRequired && secretHdrInput) {
                const s = String(secretHdrInput.value || '').trim();
                if (!s) {
                    setStatus('First-run secret is required on this server.', true);
                    submitBtn.disabled = false;
                    return;
                }
                headers['X-First-Run-Secret'] = s;
            }

            const res = await fetch('/api/first-run/complete', {
                method: 'POST',
                headers,
                body: JSON.stringify(body),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setStatus(data.error || res.statusText || 'Request failed', true);
                submitBtn.disabled = false;
                return;
            }
            setStatus('Saved. Redirecting…', false);
            window.location.href = data.redirect || '/';
        } catch (e) {
            setStatus(e && e.message ? String(e.message) : String(e), true);
            submitBtn.disabled = false;
        }
    });

    refreshStatus();
})();
