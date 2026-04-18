/**
 * Control panel: first-run admin token (DB), then load/save runtime settings.
 */
(function () {
    const bootstrapSection = document.getElementById('admin-bootstrap');
    const bootstrapToken = document.getElementById('bootstrap-token');
    const bootstrapTokenConfirm = document.getElementById('bootstrap-token-confirm');
    const bootstrapBtn = document.getElementById('admin-bootstrap-submit');

    const mainSection = document.getElementById('admin-main');
    const authHint = document.getElementById('admin-auth-hint');
    const changeWrap = document.getElementById('admin-change-wrap');

    const tokenInput = document.getElementById('admin-token');
    const loadBtn = document.getElementById('admin-load');
    const saveBtn = document.getElementById('admin-save');
    const statusEl = document.getElementById('admin-status');
    const fieldsEl = document.getElementById('admin-fields');

    const changeCurrent = document.getElementById('change-current');
    const changeNew = document.getElementById('change-new');
    const changeNew2 = document.getElementById('change-new2');
    const changeBtn = document.getElementById('admin-change-submit');

    if (!bootstrapSection || !mainSection || !tokenInput || !loadBtn || !saveBtn || !statusEl || !fieldsEl) return;

    const STORAGE_KEY = 'tornapijs_admin_token';

    function setStatus(msg, isErr) {
        statusEl.textContent = msg;
        statusEl.className = isErr ? 'admin-status admin-status-err' : 'admin-status admin-status-ok';
        if (!isErr && msg) {
            statusEl.classList.add('admin-status-flash');
            const prev = statusEl._flashTimer;
            if (prev) clearTimeout(prev);
            statusEl._flashTimer = setTimeout(() => {
                statusEl.classList.remove('admin-status-flash');
            }, 900);
        }
    }

    /** Brief highlight on a settings field after a successful save (DOM must already contain the row). */
    function flashFieldSaved(key) {
        const wrap = fieldsEl.querySelector(`[data-admin-field-key="${key}"]`);
        if (!wrap) return;
        wrap.classList.remove('admin-field--just-saved');
        // eslint-disable-next-line no-unused-expressions
        wrap.offsetWidth;
        wrap.classList.add('admin-field--just-saved');
        const t = wrap._savedGlowTimer;
        if (t) clearTimeout(t);
        wrap._savedGlowTimer = setTimeout(() => {
            wrap.classList.remove('admin-field--just-saved');
        }, 1400);
    }

    function flashSavedFields(keys) {
        requestAnimationFrame(() => {
            for (const k of keys) flashFieldSaved(k);
        });
    }

    function bearer() {
        const t = String(tokenInput.value || '').trim();
        return t ? `Bearer ${t}` : '';
    }

    function loadStoredToken() {
        try {
            const t = sessionStorage.getItem(STORAGE_KEY);
            if (t) tokenInput.value = t;
        } catch {
            /* ignore */
        }
    }

    function storeToken() {
        try {
            sessionStorage.setItem(STORAGE_KEY, String(tokenInput.value || '').trim());
        } catch {
            /* ignore */
        }
    }

    const API_KEY_POOL_KEY = 'TORN_PUBLIC_API_KEYS';
    const API_KEY_LEN = 16;

    function fieldId(key) {
        return `admin-field-${key.replace(/[^a-z0-9_-]/gi, '-')}`;
    }

    function keyPoolListId() {
        return `${fieldId(API_KEY_POOL_KEY)}-list`;
    }

    function sortedKeyJson(arr) {
        return JSON.stringify([...(Array.isArray(arr) ? arr : [])].map(String).sort());
    }

    function renderApiKeyPoolRow(listEl, keyValue) {
        const row = document.createElement('div');
        row.className = 'api-key-row';
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.className = 'api-key-input';
        inp.spellcheck = false;
        inp.autocomplete = 'off';
        inp.placeholder = `${API_KEY_LEN}-character key`;
        inp.maxLength = 32;
        inp.value = keyValue == null ? '' : String(keyValue).trim();
        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'btn btn-danger api-key-remove';
        del.textContent = 'Remove';
        row.appendChild(inp);
        row.appendChild(del);
        listEl.appendChild(row);
    }

    function renderApiKeyPoolField(wrap, m, effective) {
        const lab = document.createElement('div');
        lab.className = 'admin-field-label-block';
        const title = document.createElement('span');
        title.className = 'admin-field-label';
        title.textContent = m.label;
        const help = document.createElement('span');
        help.className = 'admin-field-help';
        help.textContent = m.help;
        lab.appendChild(title);
        lab.appendChild(help);
        wrap.appendChild(lab);

        const listEl = document.createElement('div');
        listEl.id = keyPoolListId();
        listEl.className = 'api-key-pool';
        listEl.dataset.settingKey = m.key;
        listEl.dataset.settingType = 'api-key-pool';

        const keys = Array.isArray(effective[m.key]) ? effective[m.key] : [];
        for (const k of keys) {
            renderApiKeyPoolRow(listEl, k);
        }

        listEl.addEventListener('click', (ev) => {
            const btn = ev.target.closest('.api-key-remove');
            if (!btn || !listEl.contains(btn)) return;
            const row = btn.closest('.api-key-row');
            if (row) row.remove();
        });

        const addWrap = document.createElement('div');
        addWrap.className = 'api-key-add-wrap';
        const addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.className = 'btn api-key-add';
        addBtn.textContent = 'Add key';
        addBtn.addEventListener('click', () => {
            renderApiKeyPoolRow(listEl, '');
            listEl.lastElementChild?.querySelector('.api-key-input')?.focus();
        });
        addWrap.appendChild(addBtn);
        wrap.appendChild(listEl);
        wrap.appendChild(addWrap);
        const poolUpd = document.createElement('button');
        poolUpd.type = 'button';
        poolUpd.className = 'btn admin-field-update';
        poolUpd.dataset.settingKey = m.key;
        poolUpd.textContent = 'Update key pool';
        const poolUpdWrap = document.createElement('div');
        poolUpdWrap.className = 'admin-field-pool-update';
        poolUpdWrap.appendChild(poolUpd);
        wrap.appendChild(poolUpdWrap);
    }

    function readApiKeyPoolFromDom() {
        const listEl = document.getElementById(keyPoolListId());
        if (!listEl) return [];
        const inputs = listEl.querySelectorAll('.api-key-row .api-key-input');
        const out = [];
        inputs.forEach((inp) => {
            const t = String(inp.value || '').trim();
            if (t) out.push(t);
        });
        return out;
    }

    function metaEntryForKey(meta, key) {
        return meta.find((x) => x.key === key);
    }

    /**
     * Build a one-key PUT body from the current DOM (always sends that key, even if unchanged).
     * @throws {Error} validation errors
     */
    function collectSingleSettingUpdate(meta, key) {
        const m = metaEntryForKey(meta, key);
        if (!m) throw new Error('Unknown setting.');
        const out = {};
        if (m.key === API_KEY_POOL_KEY && m.type === 'string[]') {
            const keys = readApiKeyPoolFromDom();
            for (const t of keys) {
                if (t.length !== API_KEY_LEN || !/^[a-zA-Z0-9]+$/.test(t)) {
                    throw new Error(
                        `Each public API key must be exactly ${API_KEY_LEN} letters or digits (got a bad entry).`,
                    );
                }
            }
            out[m.key] = keys.length ? keys : null;
            return out;
        }
        const el = document.getElementById(fieldId(m.key));
        if (!el) throw new Error('Field not found.');
        const raw = el.value.trim();
        if (m.type === 'number') {
            if (raw === '') throw new Error(`${m.label}: enter a number, then click Update.`);
            const n = Number(raw);
            if (!Number.isFinite(n)) throw new Error(`${m.label}: not a valid number.`);
            out[m.key] = n;
            return out;
        }
        if (m.type === 'string') {
            out[m.key] = raw;
            return out;
        }
        if (m.type === 'string[]') {
            const lines = raw.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
            out[m.key] = lines;
            return out;
        }
        if (m.type === 'json') {
            let parsed;
            try {
                parsed = JSON.parse(raw || '{}');
            } catch (e) {
                throw new Error(`${m.label}: invalid JSON (${e.message})`);
            }
            out[m.key] = parsed;
            return out;
        }
        throw new Error(`Unsupported field type: ${m.type}`);
    }

    async function putAdminSettings(updates) {
        const res = await fetch('/api/admin/settings', {
            method: 'PUT',
            headers: {
                Authorization: bearer(),
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(updates),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            throw new Error(data.error || res.statusText || 'Request failed');
        }
        return data;
    }

    function renderFields(payload) {
        const { meta, effective } = payload;
        window.__adminSettingsMeta = meta;
        window.__adminSettingsEffective = effective;

        fieldsEl.textContent = '';
        let group = '';
        for (const m of meta) {
            if (m.group !== group) {
                group = m.group;
                const h = document.createElement('h2');
                h.className = 'admin-group-title';
                h.textContent = group;
                fieldsEl.appendChild(h);
            }
            const wrap = document.createElement('div');
            wrap.className = 'admin-field';
            wrap.dataset.adminFieldKey = m.key;
            if (m.key === API_KEY_POOL_KEY && m.type === 'string[]') {
                renderApiKeyPoolField(wrap, m, effective);
                fieldsEl.appendChild(wrap);
                continue;
            }
            const lab = document.createElement('label');
            lab.htmlFor = fieldId(m.key);
            const title = document.createElement('span');
            title.className = 'admin-field-label';
            title.textContent = m.label;
            const help = document.createElement('span');
            help.className = 'admin-field-help';
            help.textContent = m.help;
            lab.appendChild(title);
            lab.appendChild(help);
            wrap.appendChild(lab);
            const val = effective[m.key];
            let input;
            if (m.type === 'json' || m.type === 'string[]') {
                input = document.createElement('textarea');
                input.rows = m.type === 'string[]' ? 5 : 14;
                input.value = typeof val === 'string' ? val : JSON.stringify(val, null, 2);
            } else {
                input = document.createElement('input');
                input.type = 'text';
                input.value = val == null ? '' : String(val);
            }
            input.id = fieldId(m.key);
            input.dataset.settingKey = m.key;
            input.dataset.settingType = m.type;
            const inputRow = document.createElement('div');
            inputRow.className = 'admin-field-input-row';
            inputRow.appendChild(input);
            const upd = document.createElement('button');
            upd.type = 'button';
            upd.className = 'btn admin-field-update';
            upd.dataset.settingKey = m.key;
            upd.textContent = 'Update';
            inputRow.appendChild(upd);
            wrap.appendChild(inputRow);
            fieldsEl.appendChild(wrap);
        }
    }

    function collectUpdates(meta, effective) {
        const out = {};
        for (const m of meta) {
            if (m.key === API_KEY_POOL_KEY && m.type === 'string[]') {
                const keys = readApiKeyPoolFromDom();
                for (const t of keys) {
                    if (t.length !== API_KEY_LEN || !/^[a-zA-Z0-9]+$/.test(t)) {
                        throw new Error(
                            `Each public API key must be exactly ${API_KEY_LEN} letters or digits (got a bad entry).`,
                        );
                    }
                }
                const prev = sortedKeyJson(effective[m.key] || []);
                if (keys.length === 0) {
                    if (prev !== sortedKeyJson([])) {
                        out[m.key] = null;
                    }
                } else {
                    const next = sortedKeyJson(keys);
                    if (next !== prev) {
                        out[m.key] = keys;
                    }
                }
                continue;
            }
            const el = document.getElementById(fieldId(m.key));
            if (!el) continue;
            const raw = el.value.trim();
            if (m.type === 'number') {
                if (raw === '') continue;
                const n = Number(raw);
                if (!Number.isFinite(n)) throw new Error(`${m.label}: not a valid number.`);
                const prev = Number(effective[m.key]);
                if (prev === n) continue;
                out[m.key] = n;
            } else if (m.type === 'string') {
                if (raw === String(effective[m.key] ?? '')) continue;
                out[m.key] = raw;
            } else if (m.type === 'string[]') {
                const lines = raw.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
                const prev = JSON.stringify(effective[m.key] || []);
                const next = JSON.stringify(lines);
                if (prev === next) continue;
                out[m.key] = lines;
            } else if (m.type === 'json') {
                let parsed;
                try {
                    parsed = JSON.parse(raw || '{}');
                } catch (e) {
                    throw new Error(`${m.label}: invalid JSON (${e.message})`);
                }
                const prev = JSON.stringify(effective[m.key] || {});
                const next = JSON.stringify(parsed);
                if (prev === next) continue;
                out[m.key] = parsed;
            }
        }
        return out;
    }

    async function applyAuthUi(auth) {
        if (auth.needsBootstrap) {
            bootstrapSection.hidden = false;
            mainSection.hidden = true;
            setStatus('Create an admin token to continue.', false);
            return;
        }
        bootstrapSection.hidden = true;
        mainSection.hidden = false;
        if (auth.usesEnvToken) {
            authHint.textContent =
                'The server is using TORN_ADMIN_TOKEN from the environment. Enter that same value here, or clear the env var to use only the database-stored token.';
            changeWrap.hidden = true;
        } else {
            authHint.textContent =
                'Enter the admin token you created (stored as a hash in the settings file).';
            changeWrap.hidden = false;
        }
    }

    bootstrapBtn.addEventListener('click', async () => {
        setStatus('Saving admin token…', false);
        try {
            const res = await fetch('/api/admin/bootstrap', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    token: bootstrapToken.value,
                    tokenConfirm: bootstrapTokenConfirm.value,
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setStatus(data.error || res.statusText, true);
                return;
            }
            bootstrapToken.value = '';
            bootstrapTokenConfirm.value = '';
            await applyAuthUi(data);
            setStatus('Admin token saved. Enter it below and click Load.', false);
        } catch (e) {
            setStatus(String(e.message || e), true);
        }
    });

    changeBtn.addEventListener('click', async () => {
        setStatus('Updating admin token…', false);
        try {
            const res = await fetch('/api/admin/change-admin-token', {
                method: 'PUT',
                headers: {
                    Authorization: bearer(),
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    currentToken: changeCurrent.value,
                    newToken: changeNew.value,
                    newTokenConfirm: changeNew2.value,
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setStatus(data.error || res.statusText, true);
                return;
            }
            changeCurrent.value = '';
            changeNew.value = '';
            changeNew2.value = '';
            tokenInput.value = '';
            try {
                sessionStorage.removeItem(STORAGE_KEY);
            } catch {
                /* ignore */
            }
            setStatus('Admin token updated. Enter the new token above and click Load.', false);
            await applyAuthUi(data);
        } catch (e) {
            setStatus(String(e.message || e), true);
        }
    });

    loadBtn.addEventListener('click', async () => {
        storeToken();
        setStatus('Loading…', false);
        try {
            const res = await fetch('/api/admin/settings', {
                headers: { Authorization: bearer() },
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                if (data.needsBootstrap) {
                    await applyAuthUi({ needsBootstrap: true });
                }
                setStatus(data.error || res.statusText, true);
                return;
            }
            renderFields(data);
            setStatus(`Loaded. Settings file: ${data.settingsStorePath || data.dbPath || '(unknown)'}`, false);
        } catch (e) {
            setStatus(String(e.message || e), true);
        }
    });

    saveBtn.addEventListener('click', async () => {
        storeToken();
        setStatus('Saving…', false);
        try {
            const meta = window.__adminSettingsMeta;
            const eff = window.__adminSettingsEffective;
            if (!meta || !eff) {
                setStatus('Load settings first.', true);
                return;
            }
            const updates = collectUpdates(meta, eff);
            if (Object.keys(updates).length === 0) {
                setStatus('No changes to save.', false);
                return;
            }
            const data = await putAdminSettings(updates);
            const keys = Object.keys(updates);
            renderFields(data);
            flashSavedFields(keys);
            setStatus(keys.length === 1 ? `Saved ${keys[0]}.` : `Saved ${keys.length} settings.`, false);
        } catch (e) {
            setStatus(String(e.message || e), true);
        }
    });

    fieldsEl.addEventListener('click', async (ev) => {
        const btn = ev.target.closest('.admin-field-update');
        if (!btn || !fieldsEl.contains(btn)) return;
        const key = btn.dataset.settingKey;
        if (!key) return;
        storeToken();
        const meta = window.__adminSettingsMeta;
        const eff = window.__adminSettingsEffective;
        if (!meta || !eff) {
            setStatus('Load settings first.', true);
            return;
        }
        let updates;
        try {
            updates = collectSingleSettingUpdate(meta, key);
        } catch (err) {
            setStatus(String(err.message || err), true);
            return;
        }
        btn.disabled = true;
        setStatus(`Updating ${key}…`, false);
        try {
            const data = await putAdminSettings(updates);
            renderFields(data);
            flashSavedFields(Object.keys(updates));
            setStatus(`Saved ${key}.`, false);
        } catch (err) {
            setStatus(String(err.message || err), true);
        } finally {
            btn.disabled = false;
        }
    });

    (async function init() {
        try {
            const res = await fetch('/api/admin/auth-status');
            const auth = await res.json().catch(() => ({}));
            if (!res.ok) {
                setStatus(auth.error || 'Could not read auth status.', true);
                return;
            }
            await applyAuthUi(auth);
            if (!auth.needsBootstrap) {
                loadStoredToken();
                if (String(tokenInput.value || '').trim()) {
                    loadBtn.click();
                }
            }
        } catch (e) {
            setStatus(String(e.message || e), true);
        }
    })();
})();
