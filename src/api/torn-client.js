/**
 * Low-level Torn API client.
 * Handles HTTP requests to api.torn.com; does not contain business logic.
 * Optional counter object increments on each request for usage tracking.
 */

const { API_BASE } = require('../constants.js');

/**
 * Fetch a user selection from Torn (profile, personalstats, etc.).
 * Multiple selections (e.g. "profile,personalstats") count as one API call.
 * @param {number|string} id - User ID
 * @param {string} selections - Comma-separated selection names
 * @param {string} apiKey - Torn API key
 * @param {{ value: number }} [counter] - If provided, counter.value is incremented per request
 * @returns {Promise<object>} Parsed JSON response
 */
async function fetchUser(id, selections, apiKey, counter, queryParams = undefined) {
    if (counter) counter.value++;
    const url = new URL(`${API_BASE}/user/${id}`);
    url.searchParams.set('selections', selections);
    url.searchParams.set('key', apiKey);
    if (queryParams && typeof queryParams === 'object') {
        for (const [k, v] of Object.entries(queryParams)) {
            if (v == null) continue;
            url.searchParams.set(k, String(v));
        }
    }
    const res = await fetch(url.toString());
    return res.json();
}

/**
 * Fetch faction basic info (e.g. name) by faction ID.
 * @param {number} factionId - Faction ID
 * @param {string} apiKey - Torn API key
 * @param {{ value: number }} [counter] - Optional request counter
 * @returns {Promise<string|null>} Faction name or null on error
 */
async function fetchFactionName(factionId, apiKey, counter) {
    try {
        if (counter) counter.value++;
        const url = `${API_BASE}/faction/${factionId}?selections=basic&key=${apiKey}`;
        const res = await fetch(url);
        const data = await res.json();
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
 * @param {string} apiKey - Torn API key
 * @param {{ value: number }} [counter] - Optional request counter
 * @returns {Promise<string|null>} Company name or null on error
 */
async function fetchCompanyName(companyId, apiKey, counter) {
    try {
        if (counter) counter.value++;
        const url = `${API_BASE}/company/${companyId}?selections=profile&key=${apiKey}`;
        const res = await fetch(url);
        const data = await res.json();
        if (data?.error) return null;
        const name = data?.name ?? data?.profile?.name ?? data?.company_name ?? data?.profile?.company_name ?? null;
        return typeof name === 'string' ? name : null;
    } catch {
        return null;
    }
}

/**
 * Best-effort extract numeric stat value from Torn v2 personalstats response.
 * Handles a few response shapes defensively.
 * @param {object} data
 * @param {string} statName
 * @returns {number|null}
 */
function extractV2PersonalStatValue(data, statName) {
    const toNum = (v) => {
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
    };
    const pickFromObj = (obj) => {
        if (!obj || typeof obj !== 'object') return null;
        for (const k of ['value', 'total', 'count', 'amount', 'month', 'last_month', 'lastMonth', 'current']) {
            const n = toNum(obj[k]);
            if (n != null) return n;
        }
        return null;
    };

    const direct = toNum(data?.[statName]);
    if (direct != null) return direct;

    const statsDirect = toNum(data?.stats?.[statName]);
    if (statsDirect != null) return statsDirect;

    const personalDirect = toNum(data?.personalstats?.[statName]);
    if (personalDirect != null) return personalDirect;

    const personalObj = pickFromObj(data?.personalstats?.[statName]);
    if (personalObj != null) return personalObj;

    // Array shape support: [{ name: 'xantaken', value: 123 }]
    const scanArrays = [data?.personalstats, data?.stats, data];
    for (const arr of scanArrays) {
        if (!Array.isArray(arr)) continue;
        for (const item of arr) {
            if (!item || typeof item !== 'object') continue;
            const key = String(item.name ?? item.stat ?? item.key ?? '').toLowerCase();
            if (key === String(statName).toLowerCase()) {
                const itemNum = toNum(item.value) ?? toNum(item.total) ?? toNum(item.count) ?? toNum(item.amount);
                if (itemNum != null) return itemNum;
                const nested = pickFromObj(item);
                if (nested != null) return nested;
            }
        }
    }

    // Generic recursive scan for exact stat key.
    const stack = [data];
    while (stack.length) {
        const cur = stack.pop();
        if (!cur || typeof cur !== 'object') continue;
        for (const [k, v] of Object.entries(cur)) {
            if (k === statName) {
                const n = toNum(v);
                if (n != null) return n;
                const nested = pickFromObj(v);
                if (nested != null) return nested;
            }
            if (v && typeof v === 'object') stack.push(v);
        }
    }

    return null;
}

/**
 * Fetch one personal stat from Torn v2.
 * Example:
 *   GET /v2/user/:id/personalstats?stat=xantaken&key=...
 *   GET /v2/user/:id/personalstats?stat=xantaken&timestamp=...&key=...
 *
 * @param {number|string} id
 * @param {string} statName
 * @param {string} apiKey
 * @param {{ value: number }} [counter]
 * @param {number} [timestamp]
 * @returns {Promise<{ value: number|null, raw: object }>}
 */
async function fetchUserPersonalStatV2(id, statName, apiKey, counter, timestamp = undefined) {
    if (counter) counter.value++;
    const url = new URL(`${API_BASE}/v2/user/${id}/personalstats`);
    url.searchParams.set('stat', statName);
    url.searchParams.set('key', apiKey);
    if (timestamp != null) {
        url.searchParams.set('timestamp', String(timestamp));
    }
    const res = await fetch(url.toString());
    const data = await res.json();
    return {
        value: extractV2PersonalStatValue(data, statName),
        raw: data,
    };
}

module.exports = {
    fetchUser,
    fetchFactionName,
    fetchCompanyName,
    fetchUserPersonalStatV2,
};
