/**
 * Torn City API – get player level by ID
 * Use from Node or browser. For Torn website, use the Tampermonkey script in scripts/.
 *
 * API key: https://www.torn.com/preferences.php#tab=api
 */

const API_BASE = 'https://api.torn.com';

/**
 * Fetch a player's level from the Torn API.
 * @param {number|string} playerId - Torn player ID
 * @param {string} apiKey - Your Torn API key (16 chars)
 * @returns {Promise<number|null>} Player level or null on error
 */
async function getPlayerLevel(playerId, apiKey) {
    if (!apiKey) {
        throw new Error('Torn API key is required');
    }
    const url = `${API_BASE}/user/${playerId}?selections=profile&key=${apiKey}`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.error) {
        console.warn('Torn API error:', data.error);
        return null;
    }

    const level = data.level != null ? data.level : (data.profile && data.profile.level != null ? data.profile.level : null);
    return level != null ? Number(level) : null;
}

// Node / ESM
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getPlayerLevel };
}
