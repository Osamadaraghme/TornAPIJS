/**
 * Service: get a random valid player (ID + level).
 * Probes random IDs until the API returns a valid profile; no activity or tier filters.
 */

const { fetchUser } = require('../api/torn-client.js');
const { extractLevel } = require('../utils/extractors.js');
const { randomIntInclusive } = require('../utils/helpers.js');

/**
 * Get a random player's ID and level.
 * @param {string} apiKey - Torn API key
 * @param {{ minId?: number, maxId?: number, maxTries?: number }} [opts]
 * @returns {Promise<{ id: number, level: number }>}
 */
async function getRandomPlayer(apiKey, opts = {}) {
    if (!apiKey) throw new Error('Torn API key is required');

    const minId = Number.isFinite(opts.minId) ? opts.minId : 1;
    const maxId = Number.isFinite(opts.maxId) ? opts.maxId : 3000000;
    const maxTries = Number.isFinite(opts.maxTries) ? opts.maxTries : 25;

    for (let i = 0; i < maxTries; i++) {
        const id = randomIntInclusive(minId, maxId);
        const data = await fetchUser(id, 'profile', apiKey);

        if (data?.error) continue;

        const level = extractLevel(data);
        if (level == null) continue;

        return { id: Number(id), level: Number(level) };
    }

    throw new Error(`Could not find a valid player after ${maxTries} tries. Try increasing maxTries or adjusting maxId.`);
}

module.exports = {
    getRandomPlayer,
};
