/**
 * Low-level Torn API client.
 * Handles HTTP requests to api.torn.com; does not contain business logic.
 * Optional counter object increments on each request for usage tracking.
 */

const { API_BASE } = require('../constants.js');
const { TORN_PUBLIC_API_KEYS } = require('../static-api-keys.js');

function uniqueKeys(keys) {
    const out = [];
    const seen = new Set();
    for (const raw of keys) {
        if (raw == null) continue;
        const k = String(raw).trim();
        if (!k) continue;
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(k);
    }
    return out;
}

/**
 * Resolve API keys for requests.
 * Priority:
 * 1) keys passed directly to the method (string or string[])
 * 2) process.env.TORN_API_KEY
 * 3) static key list (`src/static-api-keys.js`)
 */
function resolveApiKeys(apiKeyOrKeys) {
    if (Array.isArray(apiKeyOrKeys) && apiKeyOrKeys.length) {
        return uniqueKeys(apiKeyOrKeys);
    }
    if (typeof apiKeyOrKeys === 'string' && apiKeyOrKeys.trim()) {
        return uniqueKeys([apiKeyOrKeys]);
    }
    return uniqueKeys([process.env.TORN_API_KEY, ...(TORN_PUBLIC_API_KEYS || [])]);
}

function tornErrorCode(data) {
    const code = data?.error?.code ?? data?.error?.error_code ?? null;
    return Number.isFinite(Number(code)) ? Number(code) : null;
}

/**
 * Execute one Torn request, rotating to next key only on rate-limit (code 5).
 * @param {(apiKey: string) => URL} buildUrl
 * @param {string|string[]|undefined} apiKeyOrKeys
 * @param {{ value: number }|undefined} counter
 * @returns {Promise<object>}
 */
async function requestWithApiKeyFailover(buildUrl, apiKeyOrKeys, counter) {
    const keys = resolveApiKeys(apiKeyOrKeys);
    if (!keys.length) {
        throw new Error('No Torn API keys configured. Set TORN_API_KEY or add keys to src/static-api-keys.js.');
    }

    let lastData = null;
    for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        if (counter) counter.value++;
        const res = await fetch(buildUrl(key).toString());
        const data = await res.json();
        lastData = data;

        const code = tornErrorCode(data);
        const canTryNext = i < keys.length - 1;
        if (code === 5 && canTryNext) {
            continue;
        }
        return data;
    }

    return lastData || {};
}

/**
 * Fetch a user selection from Torn (profile, personalstats, etc.).
 * Multiple selections (e.g. "profile,personalstats") count as one API call.
 * @param {number|string} id - User ID
 * @param {string} selections - Comma-separated selection names
 * @param {string|string[]} apiKey - Torn API key or key pool
 * @param {{ value: number }} [counter] - If provided, counter.value is incremented per request
 * @returns {Promise<object>} Parsed JSON response
 */
async function fetchUser(id, selections, apiKey, counter, queryParams = undefined) {
    return requestWithApiKeyFailover((key) => {
        const url = new URL(`${API_BASE}/user/${id}`);
        url.searchParams.set('selections', selections);
        url.searchParams.set('key', key);
        if (queryParams && typeof queryParams === 'object') {
            for (const [k, v] of Object.entries(queryParams)) {
                if (v == null) continue;
                url.searchParams.set(k, String(v));
            }
        }
        return url;
    }, apiKey, counter);
}

/**
 * Fetch a Torn-wide selection (e.g. factionhof).
 * @param {string} selections - Selection name(s)
 * @param {string|string[]} apiKey - Torn API key or key pool
 * @param {{ value: number }} [counter] - Optional request counter
 * @param {Record<string, unknown>} [queryParams] - Optional query params
 * @returns {Promise<object>} Parsed JSON response
 */
async function fetchTorn(selections, apiKey, counter, queryParams = undefined) {
    const normalizedSelections = String(selections || '').trim().toLowerCase();
    return requestWithApiKeyFailover((key) => {
        // Torn `factionhof` is v2-only and requires a category (`cat`).
        if (normalizedSelections === 'factionhof') {
            const url = new URL(`${API_BASE}/v2/torn/factionhof`);
            url.searchParams.set('key', key);
            const cat = (queryParams && queryParams.cat) ? String(queryParams.cat) : 'respect';
            url.searchParams.set('cat', cat);
            if (queryParams && typeof queryParams === 'object') {
                for (const [k, v] of Object.entries(queryParams)) {
                    if (v == null || k === 'cat') continue;
                    url.searchParams.set(k, String(v));
                }
            }
            return url;
        }

        const url = new URL(`${API_BASE}/torn/`);
        url.searchParams.set('selections', selections);
        url.searchParams.set('key', key);
        if (queryParams && typeof queryParams === 'object') {
            for (const [k, v] of Object.entries(queryParams)) {
                if (v == null) continue;
                url.searchParams.set(k, String(v));
            }
        }
        return url;
    }, apiKey, counter);
}

/**
 * Fetch a faction selection by faction ID (or key owner if ID omitted).
 * @param {number|string} factionId - Faction ID
 * @param {string} selections - Selection name(s)
 * @param {string|string[]} apiKey - Torn API key or key pool
 * @param {{ value: number }} [counter] - Optional request counter
 * @param {Record<string, unknown>} [queryParams] - Optional query params
 * @returns {Promise<object>} Parsed JSON response
 */
async function fetchFaction(factionId, selections, apiKey, counter, queryParams = undefined) {
    return requestWithApiKeyFailover((key) => {
        const url = new URL(`${API_BASE}/faction/${factionId}`);
        url.searchParams.set('selections', selections);
        url.searchParams.set('key', key);
        if (queryParams && typeof queryParams === 'object') {
            for (const [k, v] of Object.entries(queryParams)) {
                if (v == null) continue;
                url.searchParams.set(k, String(v));
            }
        }
        return url;
    }, apiKey, counter);
}

/**
 * Fetch faction basic info (e.g. name) by faction ID.
 * @param {number} factionId - Faction ID
 * @param {string|string[]} apiKey - Torn API key or key pool
 * @param {{ value: number }} [counter] - Optional request counter
 * @returns {Promise<string|null>} Faction name or null on error
 */
async function fetchFactionName(factionId, apiKey, counter) {
    try {
        const data = await requestWithApiKeyFailover((key) => {
            const url = new URL(`${API_BASE}/faction/${factionId}`);
            url.searchParams.set('selections', 'basic');
            url.searchParams.set('key', key);
            return url;
        }, apiKey, counter);
        if (data?.error) return null;
        const name = data?.name ?? data?.basic?.name ?? null;
        return typeof name === 'string' ? name : null;
    } catch {
        return null;
    }
}

/**
 * Fetch company profile (e.g. name) by company ID.
 * May return null for other players' companies (API error 7).
 * @param {number} companyId - Company ID
 * @param {string|string[]} apiKey - Torn API key or key pool
 * @param {{ value: number }} [counter] - Optional request counter
 * @returns {Promise<string|null>} Company name or null on error
 */
async function fetchCompanyName(companyId, apiKey, counter) {
    try {
        const data = await requestWithApiKeyFailover((key) => {
            const url = new URL(`${API_BASE}/company/${companyId}`);
            url.searchParams.set('selections', 'profile');
            url.searchParams.set('key', key);
            return url;
        }, apiKey, counter);
        if (data?.error) return null;
        const name = data?.name ?? data?.profile?.name ?? data?.company_name ?? data?.profile?.company_name ?? null;
        return typeof name === 'string' ? name : null;
    } catch {
        return null;
    }
}

function toFiniteNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

/**
 * Extract a named personal stat value from a v2 payload.
 * Supports common response shapes defensively.
 * @param {object} data
 * @param {string} statName
 * @returns {number|null}
 */
function extractV2PersonalStatValue(data, statName) {
    const name = String(statName || '').toLowerCase();
    if (!name) return null;

    const direct = toFiniteNumber(data?.[statName]);
    if (direct != null) return direct;

    const psObj = data?.personalstats;
    if (psObj && typeof psObj === 'object') {
        const fromPs = toFiniteNumber(psObj?.[statName]);
        if (fromPs != null) return fromPs;
    }

    const statArray = Array.isArray(data?.personalstats)
        ? data.personalstats
        : (Array.isArray(data?.stats) ? data.stats : null);
    if (statArray) {
        for (const item of statArray) {
            if (!item || typeof item !== 'object') continue;
            const itemName = String(item.stat ?? item.name ?? item.key ?? '').toLowerCase();
            if (itemName !== name) continue;
            const val = toFiniteNumber(item.value)
                ?? toFiniteNumber(item.total)
                ?? toFiniteNumber(item.count)
                ?? toFiniteNumber(item.amount);
            if (val != null) return val;
        }
    }

    return null;
}

/**
 * Fetch one v2 user personal stat.
 * Example:
 *   /v2/user/:id/personalstats?stat=xantaken&key=...
 *   /v2/user/:id/personalstats?stat=xantaken&timestamp=...&key=...
 *
 * @param {number|string} id
 * @param {string} statName
 * @param {string|string[]|undefined} apiKey
 * @param {{ value: number }} [counter]
 * @param {number} [timestamp]
 * @returns {Promise<{ value: number|null, raw: object }>}
 */
async function fetchUserPersonalStatV2(id, statName, apiKey, counter, timestamp = undefined) {
    const data = await requestWithApiKeyFailover((key) => {
        const url = new URL(`${API_BASE}/v2/user/${id}/personalstats`);
        url.searchParams.set('stat', statName);
        url.searchParams.set('key', key);
        if (timestamp != null) url.searchParams.set('timestamp', String(timestamp));
        return url;
    }, apiKey, counter);

    return {
        value: extractV2PersonalStatValue(data, statName),
        raw: data,
    };
}

/**
 * Fetch multiple v2 personal stats in one call (comma-separated `stat` names).
 * @param {number|string} id
 * @param {string} statsCsv - e.g. `xantaken,timeplayed,activestreak`
 * @param {string|string[]|undefined} apiKey
 * @param {{ value: number }} [counter]
 * @param {number} [timestamp] - optional historical snapshot (supported stats only)
 * @returns {Promise<{ values: Record<string, number|null>, raw: object }>}
 */
async function fetchUserPersonalStatsV2(id, statsCsv, apiKey, counter, timestamp = undefined) {
    const data = await requestWithApiKeyFailover((key) => {
        const url = new URL(`${API_BASE}/v2/user/${id}/personalstats`);
        url.searchParams.set('stat', statsCsv);
        url.searchParams.set('key', key);
        if (timestamp != null) url.searchParams.set('timestamp', String(timestamp));
        return url;
    }, apiKey, counter);

    const keys = String(statsCsv)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    const values = {};
    for (const k of keys) {
        const norm = k.toLowerCase();
        const v =
            extractV2PersonalStatValue(data, norm)
            ?? extractV2PersonalStatValue(data, k);
        values[norm] = v;
    }

    return { values, raw: data };
}

module.exports = {
    fetchUser,
    fetchTorn,
    fetchFaction,
    fetchFactionName,
    fetchCompanyName,
    fetchUserPersonalStatV2,
    fetchUserPersonalStatsV2,
};
