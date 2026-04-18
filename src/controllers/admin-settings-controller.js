/**
 * Admin settings: read effective values + schema; apply validated updates.
 */

const { getMergedConstants, invalidateRuntimeSettingsCache, OVERRIDE_KEYS } = require('../runtime-config');
const {
    getAllOverrides,
    upsertMany,
    deleteMany,
    pruneSettingsStoreToKeys,
} = require('../settings/settings-repository');
const { validateAndNormalizeUpdates } = require('../services/admin-settings-service');

const SETTING_META = [
    {
        key: 'TORN_PUBLIC_API_KEYS',
        group: 'Torn API',
        label: 'Public API key pool',
        type: 'string[]',
        help: 'Keys tried after TORN_API_KEY env (same as src/static-api-keys.js when this list is not overridden). Use Add key / Remove per row; each key is 16 characters. Save with an empty list to clear the override.',
    },
    {
        key: 'AVG_DAYS_PER_MONTH',
        group: 'Scoring',
        label: 'Avg days per month',
        type: 'number',
        help: 'Used for monthly xanax/time averages (default 30.4375).',
    },
    {
        key: 'XANAX_PER_DAY_FOR_FULL_SCORE',
        group: 'Scoring',
        label: 'Xanax per day for 100% xan score',
        type: 'number',
        help: 'Average daily xanax in the window that maps to 100% xan component.',
    },
    {
        key: 'HOURS_PER_DAY_FOR_FULL_TIME_SCORE',
        group: 'Scoring',
        label: 'Hours per day for 100% time score',
        type: 'number',
        help: 'Average hours played per day (last-month window) for 100% time component.',
    },
    {
        key: 'RECRUITMENT_TIER_XAN_WEIGHT',
        group: 'Scoring',
        label: 'Tier weight: xanax',
        type: 'number',
        help: 'Must sum to 1 with time weight (default 0.75).',
    },
    {
        key: 'RECRUITMENT_TIER_TIME_WEIGHT',
        group: 'Scoring',
        label: 'Tier weight: time',
        type: 'number',
        help: 'Must sum to 1 with xanax weight (default 0.25).',
    },
];

function pruneLegacyStoreKeys() {
    if (pruneSettingsStoreToKeys(OVERRIDE_KEYS)) {
        invalidateRuntimeSettingsCache();
    }
}

function getAdminSettingsPayload() {
    pruneLegacyStoreKeys();
    const effective = getMergedConstants();
    const overrides = getAllOverrides();
    const { resolvedSettingsStorePath } = require('../settings/settings-repository');
    const storePath = resolvedSettingsStorePath();

    return {
        meta: SETTING_META,
        effective: {
            TORN_PUBLIC_API_KEYS: effective.TORN_PUBLIC_API_KEYS,
            AVG_DAYS_PER_MONTH: effective.AVG_DAYS_PER_MONTH,
            XANAX_PER_DAY_FOR_FULL_SCORE: effective.XANAX_PER_DAY_FOR_FULL_SCORE,
            HOURS_PER_DAY_FOR_FULL_TIME_SCORE: effective.HOURS_PER_DAY_FOR_FULL_TIME_SCORE,
            RECRUITMENT_TIER_XAN_WEIGHT: effective.RECRUITMENT_TIER_XAN_WEIGHT,
            RECRUITMENT_TIER_TIME_WEIGHT: effective.RECRUITMENT_TIER_TIME_WEIGHT,
        },
        overriddenKeys: Object.keys(overrides).filter((k) => OVERRIDE_KEYS.has(k)),
        /** @deprecated use settingsStorePath */
        dbPath: storePath,
        settingsStorePath: storePath,
    };
}

/**
 * @param {Record<string, unknown>} body
 */
function applyAdminSettingsUpdates(body) {
    pruneLegacyStoreKeys();
    const normalized = validateAndNormalizeUpdates(body);
    const toDelete = [];
    const toUpsert = {};
    for (const [k, v] of Object.entries(normalized)) {
        if (v === null) toDelete.push(k);
        else toUpsert[k] = v;
    }
    if (toDelete.length) deleteMany(toDelete);
    if (Object.keys(toUpsert).length) upsertMany(toUpsert);
    invalidateRuntimeSettingsCache();
}

module.exports = {
    getAdminSettingsPayload,
    applyAdminSettingsUpdates,
    SETTING_META,
};
