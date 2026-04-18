/**
 * Admin HTTP routes: JSON API + control panel for JSON-backed runtime settings.
 */

const path = require('path');
const {
    getAdminSettingsPayload,
    applyAdminSettingsUpdates,
} = require(path.join(__dirname, '..', 'src', 'controllers', 'admin-settings-controller.js'));
const {
    needsBootstrap,
    verifyAdminToken,
    bootstrapAdminToken,
    changeAdminToken,
    getAuthStatusPayload,
} = require(path.join(__dirname, '..', 'src', 'services', 'admin-token-service.js'));

function extractBearerToken(req) {
    const auth = req.headers.authorization || '';
    const fromHeader = auth.replace(/^Bearer\s+/i, '').trim();
    if (fromHeader) return fromHeader;
    return req.query.token ? String(req.query.token).trim() : '';
}

function requireAdmin(req, res, next) {
    if (needsBootstrap()) {
        res.status(403).json({
            error: 'Set an admin token using the form on this page first.',
            needsBootstrap: true,
        });
        return;
    }
    const sent = extractBearerToken(req);
    if (!verifyAdminToken(sent)) {
        res.status(401).json({ error: 'Unauthorized.' });
        return;
    }
    next();
}

/**
 * @param {import('express').Express} app
 * @param {{ layout: Function, escapeHtml?: Function }} helpers
 */
function registerAdminSettingsRoutes(app, { layout, escapeHtml }) {
    const esc = escapeHtml
        || ((s) => String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;'));
    const { resolvedSettingsStorePath } = require(path.join(__dirname, '..', 'src', 'settings', 'settings-repository'));
    const settingsStorePathEsc = esc(resolvedSettingsStorePath());
    app.get('/api/admin/auth-status', (req, res) => {
        try {
            res.json(getAuthStatusPayload());
        } catch (err) {
            res.status(500).json({ error: err?.message ? String(err.message) : String(err) });
        }
    });

    app.post('/api/admin/bootstrap', (req, res) => {
        try {
            if (!needsBootstrap()) {
                res.status(400).json({ error: 'Admin token is already configured.' });
                return;
            }
            bootstrapAdminToken(req.body?.token, req.body?.tokenConfirm);
            res.json({ ok: true, ...getAuthStatusPayload() });
        } catch (err) {
            res.status(400).json({ error: err?.message ? String(err.message) : String(err) });
        }
    });

    app.put('/api/admin/change-admin-token', requireAdmin, (req, res) => {
        try {
            changeAdminToken(req.body?.currentToken, req.body?.newToken, req.body?.newTokenConfirm);
            res.json({ ok: true, ...getAuthStatusPayload() });
        } catch (err) {
            res.status(400).json({ error: err?.message ? String(err.message) : String(err) });
        }
    });

    app.get('/api/admin/settings', requireAdmin, (req, res) => {
        try {
            res.json(getAdminSettingsPayload());
        } catch (err) {
            res.status(500).json({ error: err?.message ? String(err.message) : String(err) });
        }
    });

    app.put('/api/admin/settings', requireAdmin, (req, res) => {
        try {
            applyAdminSettingsUpdates(req.body || {});
            res.json({ ok: true, ...getAdminSettingsPayload() });
        } catch (err) {
            const msg = err?.message ? String(err.message) : String(err);
            res.status(400).json({ error: msg });
        }
    });

    app.get('/admin/control-panel', (req, res) => {
        const inner = `<article class="admin-panel page-md-doc">
<h1>Runtime settings</h1>
<p class="muted">Settings file: <code>${settingsStorePathEsc}</code> (override with <code>TORN_SETTINGS_DB_PATH</code>; per-operator name with <code>TORN_ADMIN_PROFILE</code> or the first-run wizard). Only the <strong>public API key pool</strong> and <strong>scoring constants</strong> listed below are editable here; everything else comes from <code>src/constants-defaults.js</code> and <code>src/static-api-keys.js</code> when not overridden.</p>
<pre id="admin-status" class="admin-status" aria-live="polite"></pre>

<section id="admin-bootstrap" class="admin-bootstrap" hidden>
  <h2 class="admin-group-title">Create admin access</h2>
  <p class="muted">Choose a secret token (at least 12 characters). You will use it below to load and save settings. It is stored as a hash in the database — not in plain text.</p>
  <div class="admin-field">
    <label for="bootstrap-token"><span class="admin-field-label">New admin token</span></label>
    <input type="password" id="bootstrap-token" class="admin-token-input" autocomplete="new-password" spellcheck="false"/>
  </div>
  <div class="admin-field">
    <label for="bootstrap-token-confirm"><span class="admin-field-label">Confirm admin token</span></label>
    <input type="password" id="bootstrap-token-confirm" class="admin-token-input" autocomplete="new-password" spellcheck="false"/>
  </div>
  <button type="button" class="btn btn-primary" id="admin-bootstrap-submit">Save admin token</button>
</section>

<section id="admin-main" hidden>
  <p class="muted" id="admin-auth-hint"></p>
  <section class="admin-token-bar">
    <label for="admin-token">Admin token</label>
    <input type="password" id="admin-token" class="admin-token-input" autocomplete="off" spellcheck="false" placeholder="Token you created, or TORN_ADMIN_TOKEN if set on server"/>
    <button type="button" class="btn" id="admin-load">Load</button>
    <button type="button" class="btn btn-primary" id="admin-save">Save all changes</button>
  </section>
  <p class="muted admin-field-hint">After <strong>Load</strong>, use <strong>Update</strong> beside a field to save that setting only, or <strong>Save all changes</strong> to apply every edited field in one request.</p>
  <details class="admin-change-token" id="admin-change-wrap" hidden>
    <summary>Change admin token</summary>
    <div class="admin-field">
      <label for="change-current"><span class="admin-field-label">Current token</span></label>
      <input type="password" id="change-current" class="admin-token-input" autocomplete="off"/>
    </div>
    <div class="admin-field">
      <label for="change-new"><span class="admin-field-label">New token</span></label>
      <input type="password" id="change-new" class="admin-token-input" autocomplete="new-password"/>
    </div>
    <div class="admin-field">
      <label for="change-new2"><span class="admin-field-label">Confirm new token</span></label>
      <input type="password" id="change-new2" class="admin-token-input" autocomplete="new-password"/>
    </div>
    <button type="button" class="btn" id="admin-change-submit">Update admin token</button>
  </details>
  <div id="admin-fields" class="admin-fields"></div>
</section>
<script src="/static/admin-control.js" defer></script>
</article>`;
        res.type('html').send(layout('Settings', 'admin', inner, 'page-admin'));
    });
}

module.exports = { registerAdminSettingsRoutes };
