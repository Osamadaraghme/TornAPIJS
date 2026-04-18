/**
 * Validate and normalize admin setting updates before JSON persistence.
 */

const { OVERRIDE_KEYS, getMergedConstants } = require('../runtime-config');

const TORN_KEY_LEN = 16;
const TORN_KEY_RE = /^[a-zA-Z0-9]{16}$/;

/**
 * @param {Record<string, unknown>} body
 * @returns {Record<string, unknown>}
 */
function validateAndNormalizeUpdates(body) {
    if (body == null || typeof body !== 'object' || Array.isArray(body)) {
        throw new Error('Body must be a JSON object of setting key → value.');
    }

    const out = {};
    const keys = Object.keys(body);

    for (const key of keys) {
        if (key === '__proto__' || key === 'constructor') continue;
        if (!OVERRIDE_KEYS.has(key)) {
            throw new Error(`Unknown or non-editable setting: ${key}`);
        }
        const raw = body[key];

        if (raw === null) {
            out[key] = null;
            continue;
        }

        switch (key) {
            case 'AVG_DAYS_PER_MONTH':
            case 'XANAX_PER_DAY_FOR_FULL_SCORE':
            case 'HOURS_PER_DAY_FOR_FULL_TIME_SCORE':
            case 'RECRUITMENT_TIER_XAN_WEIGHT':
            case 'RECRUITMENT_TIER_TIME_WEIGHT': {
                const n = Number(raw);
                if (!Number.isFinite(n) || n <= 0) throw new Error(`${key} must be a positive number.`);
                out[key] = n;
                break;
            }
            case 'TORN_PUBLIC_API_KEYS': {
                if (!Array.isArray(raw)) throw new Error('TORN_PUBLIC_API_KEYS must be a JSON array of strings.');
                const keysArr = [];
                for (const k of raw) {
                    const t = String(k || '').trim();
                    if (!t) continue;
                    if (!TORN_KEY_RE.test(t)) {
                        throw new Error(
                            `Each Torn public API key must be exactly ${TORN_KEY_LEN} alphanumeric characters.`,
                        );
                    }
                    keysArr.push(t);
                }
                if (!keysArr.length) {
                    throw new Error(
                        'TORN_PUBLIC_API_KEYS must contain at least one valid key. To use only src/static-api-keys.js, remove this override (PUT null for TORN_PUBLIC_API_KEYS).',
                    );
                }
                out[key] = keysArr;
                break;
            }
            default:
                throw new Error(`Unhandled admin setting: ${key}`);
        }
    }

    const xw = out.RECRUITMENT_TIER_XAN_WEIGHT;
    const tw = out.RECRUITMENT_TIER_TIME_WEIGHT;
    if (xw !== undefined || tw !== undefined) {
        const cur = getMergedConstants();
        const x = xw !== undefined ? xw : cur.RECRUITMENT_TIER_XAN_WEIGHT;
        const t = tw !== undefined ? tw : cur.RECRUITMENT_TIER_TIME_WEIGHT;
        if (!Number.isFinite(Number(x)) || !Number.isFinite(Number(t))) {
            throw new Error('Recruitment tier weights must be finite numbers.');
        }
        const sum = Number(x) + Number(t);
        if (Math.abs(sum - 1) > 1e-5) {
            throw new Error('RECRUITMENT_TIER_XAN_WEIGHT + RECRUITMENT_TIER_TIME_WEIGHT must equal 1.');
        }
    }

    return out;
}

module.exports = {
    validateAndNormalizeUpdates,
};
