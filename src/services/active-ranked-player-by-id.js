/**
 * Service: active-ranked player by ID (recruitment scoring).
 *
 * Returns the same response shape as `active-ranked-player`, but for a
 * specific `playerId` without random probing or filtering.
 *
 * Signature: `getActiveRankedPlayerById(playerId)` (API key is read from
 * `process.env.TORN_API_KEY`).
 */

const { fetchUser, fetchFactionName, fetchCompanyName } = require('../api/torn-client.js');
const {
    extractLastActionTimestampSeconds,
    extractName,
    extractLevel,
    extractAgeDays,
    hasFactionFromProfile,
    hasCompanyFromProfile,
    extractFactionId,
    extractCompanyId,
    extractCompanyNameFromProfile,
    extractXanaxTaken,
} = require('../utils/extractors.js');
const { computeScores, tierForFinalScore } = require('../utils/scoring.js');
const { messageForTornError } = require('../utils/errors.js');
const { TORN_FATAL_ERROR_CODES } = require('../constants.js');

/**
 * Build the success response object for one matched player.
 * @param {number|string} id - Player ID
 * @param {object} profileData - Normalised profile from API
 * @param {object} scores - Output from computeScores
 * @param {string} period - 'day' or 'month'
 * @param {object|null} ps - Personal stats object (or null)
 * @param {{ value: number }} counter - API call counter
 * @returns {object} Result shape; factionName/companyName filled by caller
 */
function buildResult(id, profileData, scores, period, ps, counter) {
    const name = extractName(profileData);
    const level = extractLevel(profileData);
    const hasFaction = hasFactionFromProfile(profileData);
    const hasCompany = hasCompanyFromProfile(profileData);
    const nowSeconds = Math.floor(Date.now() / 1000);
    const lastActionTs = extractLastActionTimestampSeconds(profileData);
    if (!lastActionTs) {
        throw new Error(`Could not determine last action timestamp for player ${id}.`);
    }
    const hoursSinceLastAction = (nowSeconds - lastActionTs) / 3600;

    const xanScorePct = scores.xanScore * 100;
    const finalScorePct = scores.finalScore * 100;
    const tier = tierForFinalScore(finalScorePct);

    const factionId = extractFactionId(profileData);
    const companyId = extractCompanyId(profileData);
    const companyNameFromProfile = extractCompanyNameFromProfile(profileData);

    return {
        playerId: Number(id),
        name,
        level,
        hasFaction,
        hasCompany,
        factionName: null, // filled below after async fetches
        companyName: companyNameFromProfile ?? null,
        hoursSinceLastAction: Number(hoursSinceLastAction.toFixed(2)),
        xanScore: Number(xanScorePct.toFixed(2)),
        tier,
        avgXanaxPerDay: scores.avgXanaxPerDay != null ? Number(scores.avgXanaxPerDay.toFixed(4)) : null,
        avgXanaxPerMonth: scores.avgXanaxPerMonth != null ? Number(scores.avgXanaxPerMonth.toFixed(2)) : null,
        statsAvailable: Boolean(scores.statsAvailable) && Boolean(ps),
        periodUsed: period,
        tornApiCallsUsed: counter.value,
        _factionId: factionId,
        _companyId: companyId,
        _companyNameFromProfile: companyNameFromProfile,
    };
}

/**
 * Get a specific Torn player, scored and tiered.
 * @param {number|string} playerId - Torn user ID
 * @returns {Promise<object>} Player result including tornApiCallsUsed
 */
async function getActiveRankedPlayerById(playerId) {
    const apiKey = process.env.TORN_API_KEY;
    if (!apiKey) throw new Error('Torn API key is required (set process.env.TORN_API_KEY).');
    if (playerId == null || playerId === '') throw new Error('playerId is required.');

    const normalizedId = Number(playerId);
    if (!Number.isFinite(normalizedId) || normalizedId <= 0) {
        throw new Error(`Invalid playerId: ${playerId}`);
    }

    // Recruitment-friendly default: month (matches most of your usage).
    const period = process.env.TORN_SCORE_PERIOD === 'day' ? 'day' : 'month';

    const counter = { value: 0 };
    const USER_SELECTIONS = 'profile,personalstats';

    const data = await fetchUser(normalizedId, USER_SELECTIONS, apiKey, counter);

    if (data?.error) {
        const message = messageForTornError(data.error);
        const code = data.error?.code ?? data.error?.error_code;
        if (code != null && TORN_FATAL_ERROR_CODES.has(Number(code))) {
            throw new Error(message || `Torn API error (code ${code}).`);
        }
        throw new Error(message || `Torn API error.`);
    }

    const profileData = data.profile != null ? data.profile : data;

    const ps = data?.personalstats != null
        ? (data.personalstats.personalstats ?? data.personalstats)
        : null;
    const xanTaken = ps ? extractXanaxTaken(ps) : null;
    const ageDays = extractAgeDays(profileData);

    const scores = computeScores({
        xanaxTakenTotal: xanTaken,
        ageDays,
        period,
    });

    const result = buildResult(normalizedId, profileData, scores, period, ps, counter);

    // Fetch names only if needed for this player
    result.factionName = result._factionId
        ? await fetchFactionName(result._factionId, apiKey, counter)
        : null;

    result.companyName = result._companyNameFromProfile ?? (result._companyId
        ? await fetchCompanyName(result._companyId, apiKey, counter)
        : null);

    delete result._factionId;
    delete result._companyId;
    delete result._companyNameFromProfile;

    result.tornApiCallsUsed = counter.value;
    return result;
}

module.exports = {
    getActiveRankedPlayerById,
};

