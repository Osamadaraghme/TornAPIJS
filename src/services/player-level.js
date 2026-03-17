/**
 * Service: get a single player's level by ID.
 * Single API call to user profile; no filtering or iteration.
 */

const { fetchUser } = require('../api/torn-client.js');
const { extractLevel } = require('../utils/extractors.js');

/**
 * Fetch a player's level from the Torn API.
 * @param {number|string} playerId - Torn player ID
 * @param {string} apiKey - Torn API key (16 chars)
 * @returns {Promise<number|null>} Level or null on API error
 */
async function getPlayerLevel(playerId, apiKey) {
    if (!apiKey) throw new Error('Torn API key is required');

    const data = await fetchUser(playerId, 'profile', apiKey);

    if (data?.error) {
        console.warn('Torn API error:', data.error);
        return null;
    }

    const level = extractLevel(data);
    return level != null ? Number(level) : null;
}

module.exports = {
    getPlayerLevel,
};
