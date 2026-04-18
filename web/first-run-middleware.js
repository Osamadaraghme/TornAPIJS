/**
 * Until the local settings JSON exists, only first-run + static assets are reachable.
 */

const path = require('path');
const { isSettingsStoreFileMissing } = require(path.join(__dirname, '..', 'src', 'settings', 'settings-repository'));

function pathAllowedDuringFirstRun(p) {
    return (
        p.startsWith('/first-run')
        || p.startsWith('/api/first-run')
        || p.startsWith('/static/')
        || p === '/favicon.ico'
    );
}

function firstRunGate(req, res, next) {
    try {
        if (!isSettingsStoreFileMissing()) return next();
        if (pathAllowedDuringFirstRun(req.path)) return next();
        if (req.method !== 'GET') {
            res.status(403).json({ error: 'First-time setup required.', firstRunRequired: true });
            return;
        }
        res.redirect(302, '/first-run');
    } catch (err) {
        next(err);
    }
}

module.exports = { firstRunGate };
