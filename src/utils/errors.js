/**
 * Torn API error handling and user-facing "no player found" messages.
 */

const { TORN_ERROR_MESSAGES, TORN_FATAL_ERROR_CODES } = require('../constants.js');

/**
 * Human-readable message for a Torn API error payload.
 * @param {object} [errorPayload] - e.g. { code: 2, error: "Incorrect Key" }
 * @returns {string|null}
 */
function messageForTornError(errorPayload) {
    if (!errorPayload) return null;
    const code = errorPayload.code ?? errorPayload.error_code ?? null;
    const msg = errorPayload.error ?? errorPayload.message ?? null;
    if (code != null && TORN_ERROR_MESSAGES[code]) return TORN_ERROR_MESSAGES[code];
    if (typeof msg === 'string') return msg;
    return code != null ? `Torn API error (code ${code}).` : 'Torn API returned an error.';
}

/**
 * Build an Error for "no matching player found" with context-specific message.
 * @param {{ profilesOk: number, activeCount: number, passedFiltersCount: number, lastTornError: string|null }} runStats
 * @param {{ maxTries: number, activeWithinHours: number, desiredTier: string }} opts
 * @param {{ value: number }} counter - API call count
 * @returns {Error}
 */
function buildNoPlayerFoundError(runStats, opts, counter) {
    const { profilesOk, activeCount, passedFiltersCount, lastTornError } = runStats;
    const { maxTries, activeWithinHours, desiredTier } = opts;
    const lastMsg = lastTornError ? ` Last Torn error: ${lastTornError}` : '';

    if (profilesOk === 0) {
        const hint = lastTornError || 'Check your API key and that it has access to user profile.';
        return new Error(`Every Torn API request failed (${maxTries} attempts). ${hint}`);
    }
    if (activeCount === 0) {
        return new Error(`No players were active in the last ${activeWithinHours} hours after ${profilesOk} profile checks (${counter.value} API calls). Try increasing activeWithinHours or maxTries.${lastMsg}`);
    }
    if (passedFiltersCount > 0 && desiredTier !== 'ALL') {
        return new Error(`No active player matched your tier filter (${desiredTier} or higher) after ${passedFiltersCount} candidates (${counter.value} API calls). Try a lower tier or increase maxTries.${lastMsg}`);
    }
    if (passedFiltersCount > 0) {
        return new Error(`No matching active player after ${passedFiltersCount} candidates (${counter.value} API calls). Try increasing maxTries or relaxing faction/company filters.${lastMsg}`);
    }
    return new Error(`Could not find an active player matching your filters (last ${activeWithinHours}h, ${maxTries} tries, ${counter.value} API calls). Try increasing maxTries or relaxing tier/faction/company filters.${lastMsg}`);
}

module.exports = {
    messageForTornError,
    buildNoPlayerFoundError,
    TORN_FATAL_ERROR_CODES,
};
