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

module.exports = {
    fetchUser,
    fetchFactionName,
    fetchCompanyName,
};
