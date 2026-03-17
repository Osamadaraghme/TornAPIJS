/**
 * Torn City API – random player (by random ID probing)
 *
 * Torn does not provide a "random player" endpoint, so this module picks random
 * IDs and queries `user/:ID?selections=profile` until it finds a valid player.
 *
 * API key: https://www.torn.com/preferences.php#tab=api
 */

const API_BASE = 'https://api.torn.com';

function randomIntInclusive(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function fetchUserProfileById(playerId, apiKey) {
    const url = `${API_BASE}/user/${playerId}?selections=profile&key=${apiKey}`;
    const res = await fetch(url);
    const data = await res.json();
    return data;
}

/**
 * Get a random player's ID and level.
 *
 * @param {string} apiKey Torn API key
 * @param {object} [opts]
 * @param {number} [opts.minId=1] Minimum ID to try
 * @param {number} [opts.maxId=3000000] Maximum ID to try (adjust if needed)
 * @param {number} [opts.maxTries=25] Maximum attempts before giving up
 * @returns {Promise<{id:number, level:number}>}
 */
async function getRandomPlayer(apiKey, opts = {}) {
    if (!apiKey) throw new Error('Torn API key is required');

    const minId = Number.isFinite(opts.minId) ? opts.minId : 1;
    const maxId = Number.isFinite(opts.maxId) ? opts.maxId : 3000000;
    const maxTries = Number.isFinite(opts.maxTries) ? opts.maxTries : 25;

    for (let i = 0; i < maxTries; i++) {
        const id = randomIntInclusive(minId, maxId);
        const data = await fetchUserProfileById(id, apiKey);

        // Error format is typically: { error: { code: number, error: string } }
        if (data && data.error) {
            // invalid IDs are common when probing randomly; just retry
            continue;
        }

        const level = data && (data.level != null ? data.level : (data.profile && data.profile.level != null ? data.profile.level : null));
        if (level == null) continue;

        return { id: Number(id), level: Number(level) };
    }

    throw new Error(`Could not find a valid player after ${maxTries} tries. Try increasing maxTries or adjusting maxId.`);
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getRandomPlayer };
}

