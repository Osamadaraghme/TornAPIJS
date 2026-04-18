/**
 * First-time setup: create gitignored settings file + optional profile for separate JSON per operator.
 */

const path = require('path');
const {
    isSettingsStoreFileMissing,
    resolvedSettingsStorePathQuiet,
    getActiveProfileSlug,
} = require(path.join(__dirname, '..', 'src', 'settings', 'settings-repository'));
const { envAdminToken } = require(path.join(__dirname, '..', 'src', 'services', 'admin-token-service'));
const { completeFirstRun } = require(path.join(__dirname, '..', 'src', 'services', 'first-run-service'));

function assertFirstRunPostAllowed(req) {
    const want = process.env.FIRST_RUN_SECRET;
    if (!want || !String(want).trim()) return;
    const got = req.headers['x-first-run-secret'];
    if (String(got || '').trim() !== String(want).trim()) {
        const err = new Error('Invalid or missing X-First-Run-Secret header (must match FIRST_RUN_SECRET).');
        err.statusCode = 403;
        throw err;
    }
}

/**
 * @param {import('express').Express} app
 * @param {{ layout: Function, escapeHtml: Function }} helpers
 */
function registerFirstRunRoutes(app, { layout, escapeHtml }) {
    app.get('/api/first-run/status', (req, res) => {
        try {
            const required = isSettingsStoreFileMissing();
            res.json({
                required,
                settingsStorePath: resolvedSettingsStorePathQuiet(),
                activeProfileSlug: getActiveProfileSlug(),
                envProfileOverridesWizard: Boolean(process.env.TORN_ADMIN_PROFILE?.trim()),
                customSettingsPath: Boolean(process.env.TORN_SETTINGS_DB_PATH?.trim()),
                usesEnvAdminToken: Boolean(envAdminToken()),
                firstRunSecretRequired: Boolean(process.env.FIRST_RUN_SECRET?.trim()),
            });
        } catch (err) {
            res.status(500).json({ error: err?.message ? String(err.message) : String(err) });
        }
    });

    app.post('/api/first-run/complete', (req, res) => {
        try {
            if (!isSettingsStoreFileMissing()) {
                res.status(400).json({ error: 'Initial setup is already complete.' });
                return;
            }
            assertFirstRunPostAllowed(req);
            completeFirstRun(req.body || {});
            res.json({ ok: true, redirect: '/' });
        } catch (err) {
            const code = err.statusCode && Number.isInteger(err.statusCode) ? err.statusCode : 400;
            res.status(code).json({ error: err?.message ? String(err.message) : String(err) });
        }
    });

    app.get('/first-run', (req, res) => {
        if (!isSettingsStoreFileMissing()) {
            res.redirect(302, '/');
            return;
        }
        const storePath = escapeHtml(resolvedSettingsStorePathQuiet());
        const usesEnvAdmin = Boolean(process.env.TORN_ADMIN_TOKEN?.trim());
        const needsSecretHdr = Boolean(process.env.FIRST_RUN_SECRET?.trim());
        const envProfile = Boolean(process.env.TORN_ADMIN_PROFILE?.trim());
        const customStore = Boolean(process.env.TORN_SETTINGS_DB_PATH?.trim());
        const adminSkipNote = usesEnvAdmin
            ? '<p class="msg-ok first-run-banner">This server uses <code>TORN_ADMIN_TOKEN</code> from the environment. You do not need to set an admin token below; only the settings file will be created.</p>'
            : '';
        const secretNote = needsSecretHdr
            ? `<p class="msg-err first-run-banner">This server requires header <code>X-First-Run-Secret</code> to match <code>FIRST_RUN_SECRET</code>. Paste the secret in the field at the bottom before completing setup.</p>`
            : '';
        const profileNote = customStore
            ? '<p class="muted">Profile name is not used when <code>TORN_SETTINGS_DB_PATH</code> points at a specific file.</p>'
            : envProfile
                ? '<p class="muted">Profile name below is ignored because <code>TORN_ADMIN_PROFILE</code> is set in the environment.</p>'
                : '<p class="muted">Optional <strong>settings profile</strong> keeps a separate JSON file per name (letters, numbers, <code>_</code>, <code>-</code> only). Leave blank for the default file.</p>';

        const inner = `<article class="card page-first-run">
<h1>First-time setup</h1>
<p class="muted">Local secrets and overrides are stored under <code>${storePath}</code> (gitignored). Nothing in this form is committed to the repository.</p>
${adminSkipNote}
${secretNote}
${profileNote}
<form id="first-run-form" class="first-run-form" novalidate>
  <div class="admin-field">
    <label for="fr-profile"><span class="admin-field-label">Settings profile (optional)</span></label>
    <input type="text" id="fr-profile" name="adminProfile" autocomplete="off" spellcheck="false" placeholder="e.g. alice" ${envProfile || customStore ? 'disabled' : ''}/>
  </div>
  <section class="fr-admin-tokens"${usesEnvAdmin ? ' hidden' : ''}>
    <h2 class="admin-group-title">Admin access</h2>
    <p class="muted">Choose a secret token (at least 12 characters). You will use it on the settings page. It is stored as a bcrypt hash — not in plain text.</p>
    <div class="admin-field">
      <label for="fr-token"><span class="admin-field-label">Admin token</span></label>
      <input type="password" id="fr-token" class="admin-token-input" autocomplete="new-password" spellcheck="false"/>
    </div>
    <div class="admin-field">
      <label for="fr-token2"><span class="admin-field-label">Confirm admin token</span></label>
      <input type="password" id="fr-token2" class="admin-token-input" autocomplete="new-password" spellcheck="false"/>
    </div>
  </section>
  <section>
    <h2 class="admin-group-title">Torn public API keys (optional)</h2>
    <p class="muted">Leave empty to use the built-in pool in <code>src/static-api-keys.js</code>. Add one or more 16-character keys if you want your own pool stored locally.</p>
    <div id="fr-key-list" class="api-key-list"></div>
    <button type="button" class="btn" id="fr-key-add">Add key row</button>
  </section>
  <div class="admin-field"${needsSecretHdr ? '' : ' hidden'}>
    <label for="fr-secret-hdr"><span class="admin-field-label">First-run secret (header)</span></label>
    <input type="password" id="fr-secret-hdr" class="admin-token-input" autocomplete="off" spellcheck="false" placeholder="Matches FIRST_RUN_SECRET on server"/>
  </div>
  <p class="first-run-actions">
    <button type="submit" class="btn btn-primary" id="fr-submit">Save and continue</button>
  </p>
  <pre id="fr-status" class="admin-status" aria-live="polite"></pre>
</form>
<script src="/static/first-run.js" defer></script>
</article>`;
        res.type('html').send(layout('First-time setup', '', inner, 'page-first-run'));
    });
}

module.exports = { registerFirstRunRoutes };
