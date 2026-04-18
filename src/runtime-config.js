/**
 * Effective constants = built-in defaults + JSON file overrides (see settings-repository).
 */

const defaults = require('./constants-defaults');
const staticKeys = require('./static-api-keys');
const { getAllOverrides } = require('./settings/settings-repository');

/** Keys the admin control panel may read/write in the local settings JSON (scoring + key pool only). */
const OVERRIDE_KEYS = new Set([
    'TORN_PUBLIC_API_KEYS',
    'AVG_DAYS_PER_MONTH',
    'XANAX_PER_DAY_FOR_FULL_SCORE',
    'HOURS_PER_DAY_FOR_FULL_TIME_SCORE',
    'RECRUITMENT_TIER_XAN_WEIGHT',
    'RECRUITMENT_TIER_TIME_WEIGHT',
]);

let cache = null;

function cloneDefaults() {
    const msg = { ...defaults.TORN_ERROR_MESSAGES };
    const fatal = new Set(defaults.TORN_FATAL_ERROR_CODES);
    return {
        ...defaults,
        TORN_ERROR_MESSAGES: msg,
        TORN_FATAL_ERROR_CODES: fatal,
    };
}

function buildMerged() {
    const overrides = getAllOverrides();
    const o = cloneDefaults();

    o.TORN_PUBLIC_API_KEYS =
        overrides.TORN_PUBLIC_API_KEYS != null
            ? overrides.TORN_PUBLIC_API_KEYS
            : [...(staticKeys.TORN_PUBLIC_API_KEYS || [])];

    for (const key of OVERRIDE_KEYS) {
        if (key === 'TORN_PUBLIC_API_KEYS') continue;
        if (overrides[key] === undefined) continue;
        o[key] = overrides[key];
    }
    return o;
}

function getMergedConstants() {
    if (!cache) {
        cache = buildMerged();
    }
    return cache;
}

function invalidateRuntimeSettingsCache() {
    cache = null;
}

module.exports = {
    OVERRIDE_KEYS,
    getMergedConstants,
    invalidateRuntimeSettingsCache,
};
