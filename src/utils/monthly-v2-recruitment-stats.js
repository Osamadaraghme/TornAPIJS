/**
 * Torn v2 personalstats: xantaken + timeplayed (monthly deltas) + activestreak (current).
 * Two requests: all-time snapshot with streak, then xantaken+timeplayed at month-ago timestamp.
 */

const { fetchUserPersonalStatsV2 } = require('../api/torn-client.js');
const { messageForTornError } = require('./errors.js');
const { TORN_FATAL_ERROR_CODES, AVG_DAYS_PER_MONTH } = require('../constants.js');

function toFiniteNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

function throwOnTornError(errorObj) {
    if (!errorObj) return;
    const message = messageForTornError(errorObj);
    const code = errorObj?.code ?? errorObj?.error_code;
    if (code != null && TORN_FATAL_ERROR_CODES.has(Number(code))) {
        throw new Error(message || `Torn API error (code ${code}).`);
    }
    throw new Error(message || 'Torn API error.');
}

/**
 * @param {number|string} playerId
 * @param {string|string[]|undefined} apiKey
 * @param {{ value: number }} counter
 */
async function fetchMonthlyV2RecruitmentStats(playerId, apiKey, counter) {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const monthAgoTimestamp = nowSeconds - Math.floor(AVG_DAYS_PER_MONTH * 86400);

    const all = await fetchUserPersonalStatsV2(
        playerId,
        'xantaken,timeplayed,activestreak',
        apiKey,
        counter,
    );
    throwOnTornError(all.raw?.error);

    const hist = await fetchUserPersonalStatsV2(
        playerId,
        'xantaken,timeplayed',
        apiKey,
        counter,
        monthAgoTimestamp,
    );
    throwOnTornError(hist.raw?.error);

    const allTimeXanaxTaken = toFiniteNumber(all.values?.xantaken);
    const xanaxTakenUntilLastMonth = toFiniteNumber(hist.values?.xantaken);
    let xanaxTakenDuringLastMonth = null;
    if (allTimeXanaxTaken != null && xanaxTakenUntilLastMonth != null) {
        xanaxTakenDuringLastMonth = Math.max(0, allTimeXanaxTaken - xanaxTakenUntilLastMonth);
    }

    const allTimeTimePlayed = toFiniteNumber(all.values?.timeplayed);
    const timePlayedUntilLastMonth = toFiniteNumber(hist.values?.timeplayed);
    let timePlayedDuringLastMonth = null;
    if (allTimeTimePlayed != null && timePlayedUntilLastMonth != null) {
        timePlayedDuringLastMonth = Math.max(0, allTimeTimePlayed - timePlayedUntilLastMonth);
    }

    const activeStreak = toFiniteNumber(all.values?.activestreak);

    return {
        allTimeXanaxTaken,
        xanaxTakenUntilLastMonth,
        xanaxTakenDuringLastMonth,
        allTimeTimePlayed,
        timePlayedUntilLastMonth,
        timePlayedDuringLastMonth,
        activeStreak,
    };
}

module.exports = {
    fetchMonthlyV2RecruitmentStats,
};
