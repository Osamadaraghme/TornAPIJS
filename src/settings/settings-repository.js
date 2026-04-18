/**
 * JSON file persistence for runtime setting overrides (no native addons; works on Node 24+ Windows).
 * Default file: `data/tornapijs-control.json` (override path with TORN_SETTINGS_DB_PATH).
 * Per-operator file: set `TORN_ADMIN_PROFILE` or complete first-run wizard (writes `data/.local-runtime-profile.json`).
 */

const fs = require('fs');
const path = require('path');

/** Internal key: bcrypt hash for UI-configured admin token (never merged as a runtime “constant”). */
const INTERNAL_ADMIN_BCRYPT_KEY = '__admin_token_bcrypt__';

const LOCAL_PROFILE_REL = '.local-runtime-profile.json';

function dataDir() {
    return path.join(__dirname, '..', '..', 'data');
}

/**
 * @param {unknown} raw
 * @returns {string|null}
 */
function sanitizeProfileSlug(raw) {
    const t = String(raw ?? '')
        .trim()
        .replace(/[^a-zA-Z0-9_-]/g, '_')
        .slice(0, 64);
    return t.length ? t : null;
}

/**
 * @returns {string|null}
 */
function readProfileSlugFromDisk() {
    const p = path.join(dataDir(), LOCAL_PROFILE_REL);
    if (!fs.existsSync(p)) return null;
    try {
        const o = JSON.parse(fs.readFileSync(p, 'utf8'));
        return sanitizeProfileSlug(o?.adminProfile);
    } catch {
        return null;
    }
}

/**
 * Persist optional profile slug (ignored when `TORN_ADMIN_PROFILE` env is set).
 * Empty / invalid clears the file so the default store name is used.
 * @param {unknown} raw
 */
function writeProfileSlugToDisk(raw) {
    const slug = sanitizeProfileSlug(raw);
    const dir = dataDir();
    const p = path.join(dir, LOCAL_PROFILE_REL);
    if (!slug) {
        try {
            if (fs.existsSync(p)) fs.unlinkSync(p);
        } catch {
            /* ignore */
        }
        return;
    }
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(p, `${JSON.stringify({ adminProfile: slug }, null, 2)}\n`, 'utf8');
}

/**
 * @returns {string|null}
 */
function getActiveProfileSlug() {
    const env = process.env.TORN_ADMIN_PROFILE?.trim();
    if (env) return sanitizeProfileSlug(env);
    return readProfileSlugFromDisk();
}

/**
 * Resolved JSON path without creating directories (safe for existence checks and reads).
 * @returns {string}
 */
function resolvedSettingsStorePathQuiet() {
    const env = process.env.TORN_SETTINGS_DB_PATH;
    if (env && String(env).trim()) return path.resolve(String(env).trim());
    const slug = getActiveProfileSlug();
    const base = slug ? `tornapijs-control-${slug}.json` : 'tornapijs-control.json';
    return path.join(dataDir(), base);
}

function resolvedSettingsStorePath() {
    const p = resolvedSettingsStorePathQuiet();
    const dir = path.dirname(p);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return p;
}

/**
 * @returns {boolean} true when the resolved store file is absent (first-run wizard should run).
 */
function isSettingsStoreFileMissing() {
    return !fs.existsSync(resolvedSettingsStorePathQuiet());
}

/** @deprecated alias — same path as the JSON store */
function resolvedDbPath() {
    return resolvedSettingsStorePath();
}

/**
 * @returns {Record<string, unknown>}
 */
function readStoreObject() {
    const p = resolvedSettingsStorePathQuiet();
    if (!fs.existsSync(p)) return {};
    try {
        const raw = fs.readFileSync(p, 'utf8');
        const o = JSON.parse(raw);
        return o && typeof o === 'object' && !Array.isArray(o) ? o : {};
    } catch {
        return {};
    }
}

function writeStoreObject(obj) {
    const p = resolvedSettingsStorePath();
    const dir = path.dirname(p);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    const tmp = `${p}.${process.pid}.tmp`;
    const body = `${JSON.stringify(obj, null, 2)}\n`;
    fs.writeFileSync(tmp, body, 'utf8');
    fs.renameSync(tmp, p);
}

/**
 * @returns {Record<string, unknown>}
 */
function getAllOverrides() {
    const data = readStoreObject();
    const out = { ...data };
    delete out[INTERNAL_ADMIN_BCRYPT_KEY];
    return out;
}

/**
 * @returns {string|null} bcrypt hash string
 */
function getAdminBcryptHash() {
    const v = readStoreObject()[INTERNAL_ADMIN_BCRYPT_KEY];
    return typeof v === 'string' && v.length > 20 ? v : null;
}

/**
 * @param {string} hash
 */
function setAdminBcryptHash(hash) {
    const data = readStoreObject();
    data[INTERNAL_ADMIN_BCRYPT_KEY] = hash;
    writeStoreObject(data);
}

/**
 * @param {Record<string, unknown>} updates
 */
function upsertMany(updates) {
    const pairs = Object.entries(updates);
    if (!pairs.length) return;
    const data = readStoreObject();
    for (const [k, v] of pairs) {
        data[k] = v;
    }
    writeStoreObject(data);
}

/**
 * @param {string[]} keys
 */
function deleteMany(keys) {
    if (!keys.length) return;
    const data = readStoreObject();
    let changed = false;
    for (const k of keys) {
        if (Object.prototype.hasOwnProperty.call(data, k)) {
            delete data[k];
            changed = true;
        }
    }
    if (changed) writeStoreObject(data);
}

/**
 * Remove persisted keys that are not the admin bcrypt entry or in `allowedOverrideKeys`.
 * @param {Set<string>} allowedOverrideKeys
 * @returns {boolean} true if the store file was rewritten
 */
function pruneSettingsStoreToKeys(allowedOverrideKeys) {
    const data = readStoreObject();
    let hasDisallowed = false;
    for (const k of Object.keys(data)) {
        if (k === INTERNAL_ADMIN_BCRYPT_KEY) continue;
        if (!allowedOverrideKeys.has(k)) {
            hasDisallowed = true;
            break;
        }
    }
    if (!hasDisallowed) return false;
    const next = {};
    const h = data[INTERNAL_ADMIN_BCRYPT_KEY];
    if (typeof h === 'string' && h.length > 20) {
        next[INTERNAL_ADMIN_BCRYPT_KEY] = h;
    }
    for (const k of allowedOverrideKeys) {
        if (Object.prototype.hasOwnProperty.call(data, k)) {
            next[k] = data[k];
        }
    }
    writeStoreObject(next);
    return true;
}

module.exports = {
    INTERNAL_ADMIN_BCRYPT_KEY,
    resolvedDbPath,
    resolvedSettingsStorePath,
    resolvedSettingsStorePathQuiet,
    getActiveProfileSlug,
    isSettingsStoreFileMissing,
    writeProfileSlugToDisk,
    getAllOverrides,
    getAdminBcryptHash,
    setAdminBcryptHash,
    upsertMany,
    deleteMany,
    pruneSettingsStoreToKeys,
};
