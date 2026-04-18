/**
 * Admin UI / API authentication: optional env token, or bcrypt hash stored in SQLite.
 */

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { getAdminBcryptHash, setAdminBcryptHash } = require('../settings/settings-repository');

const MIN_TOKEN_LENGTH = 12;
const BCRYPT_ROUNDS = 10;

function envAdminToken() {
    const t = process.env.TORN_ADMIN_TOKEN;
    return t && String(t).trim() ? String(t).trim() : '';
}

function timingSafeEqualStr(a, b) {
    const aa = Buffer.from(String(a), 'utf8');
    const bb = Buffer.from(String(b), 'utf8');
    if (aa.length !== bb.length) return false;
    return crypto.timingSafeEqual(aa, bb);
}

function needsBootstrap() {
    if (envAdminToken()) return false;
    return !getAdminBcryptHash();
}

function verifyAdminToken(candidate) {
    const sent = String(candidate || '').trim();
    if (!sent) return false;
    const env = envAdminToken();
    if (env) {
        return timingSafeEqualStr(sent, env);
    }
    const hash = getAdminBcryptHash();
    if (!hash) return false;
    return bcrypt.compareSync(sent, hash);
}

function assertTokenPair(token, tokenConfirm, label) {
    const a = String(token || '').trim();
    const b = String(tokenConfirm || '').trim();
    if (a.length < MIN_TOKEN_LENGTH) {
        throw new Error(`${label} must be at least ${MIN_TOKEN_LENGTH} characters.`);
    }
    if (a !== b) {
        throw new Error(`${label} and confirmation do not match.`);
    }
    return a;
}

/**
 * First-time setup (no env token and no DB hash).
 * @param {string|undefined} token
 * @param {string|undefined} tokenConfirm
 */
function bootstrapAdminToken(token, tokenConfirm) {
    if (!needsBootstrap()) {
        throw new Error('Admin token is already configured (environment or database).');
    }
    const plain = assertTokenPair(token, tokenConfirm, 'Admin token');
    const hash = bcrypt.hashSync(plain, BCRYPT_ROUNDS);
    setAdminBcryptHash(hash);
}

/**
 * @param {string|undefined} currentToken
 * @param {string|undefined} newToken
 * @param {string|undefined} newTokenConfirm
 */
function changeAdminToken(currentToken, newToken, newTokenConfirm) {
    if (envAdminToken()) {
        throw new Error(
            'TORN_ADMIN_TOKEN is set in the environment. Remove it to manage the admin token from this UI.',
        );
    }
    if (!getAdminBcryptHash()) {
        throw new Error('No database admin token exists yet. Use “Create admin access” first.');
    }
    if (!verifyAdminToken(currentToken)) {
        throw new Error('Current admin token is incorrect.');
    }
    const next = assertTokenPair(newToken, newTokenConfirm, 'New admin token');
    const hash = bcrypt.hashSync(next, BCRYPT_ROUNDS);
    setAdminBcryptHash(hash);
}

function getAuthStatusPayload() {
    const env = envAdminToken();
    const hash = getAdminBcryptHash();
    return {
        needsBootstrap: !env && !hash,
        usesEnvToken: Boolean(env),
        hasDbToken: Boolean(hash),
    };
}

module.exports = {
    needsBootstrap,
    verifyAdminToken,
    bootstrapAdminToken,
    changeAdminToken,
    getAuthStatusPayload,
    envAdminToken,
};
