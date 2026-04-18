/**
 * One-time web setup: create local settings file (gitignored) with optional per-profile path.
 */

const {
    OVERRIDE_KEYS,
    invalidateRuntimeSettingsCache,
} = require('../runtime-config');
const {
    isSettingsStoreFileMissing,
    writeStoreObject,
    writeProfileSlugToDisk,
    upsertMany,
    pruneSettingsStoreToKeys,
} = require('../settings/settings-repository');
const { bootstrapAdminToken, envAdminToken } = require('./admin-token-service');
const { validateAndNormalizeUpdates } = require('./admin-settings-service');

/**
 * @param {Record<string, unknown>} body
 */
function completeFirstRun(body) {
    if (!isSettingsStoreFileMissing()) {
        throw new Error('Initial setup is already complete.');
    }

    if (!process.env.TORN_ADMIN_PROFILE?.trim() && !process.env.TORN_SETTINGS_DB_PATH?.trim()) {
        writeProfileSlugToDisk(body?.adminProfile);
    }

    if (!isSettingsStoreFileMissing()) {
        throw new Error(
            'A settings file for this profile already exists. Remove it, change TORN_ADMIN_PROFILE, or clear the wizard profile file.',
        );
    }

    const usesEnvAdmin = Boolean(envAdminToken());
    if (usesEnvAdmin) {
        writeStoreObject({});
    } else {
        bootstrapAdminToken(body?.adminToken, body?.adminTokenConfirm);
    }

    const pick = {};
    if (body && typeof body === 'object' && !Array.isArray(body)) {
        for (const k of Object.keys(body)) {
            if (OVERRIDE_KEYS.has(k)) pick[k] = body[k];
        }
    }
    if (Object.keys(pick).length) {
        const normalized = validateAndNormalizeUpdates(pick);
        upsertMany(normalized);
    }

    pruneSettingsStoreToKeys(OVERRIDE_KEYS);
    invalidateRuntimeSettingsCache();
}

module.exports = {
    completeFirstRun,
};
