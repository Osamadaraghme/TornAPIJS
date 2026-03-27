/**
 * Service: active-ranked player by ID (CSV APIs use this under the hood).
 * Xanax month values are sourced from Torn v2 cumulative `xantaken` snapshots:
 * - all-time:      /v2/user/:id/personalstats?stat=xantaken
 * - until last mo: /v2/user/:id/personalstats?stat=xantaken&timestamp=...
 */

const {
    fetchUser,
    fetchFactionName,
    fetchCompanyName,
    fetchUserPersonalStatV2,
} = require('../api/torn-client.js');
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
    extractFactionNameFromProfile,
} = require('../utils/extractors.js');
const { computeScores, tierForFinalScore } = require('../utils/scoring.js');
const { messageForTornError } = require('../utils/errors.js');
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

async function fetchMonthlyXanaxStats(playerId, apiKey, counter) {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const monthAgoTimestamp = nowSeconds - Math.floor(AVG_DAYS_PER_MONTH * 86400);

    const allTimeRes = await fetchUserPersonalStatV2(playerId, 'xantaken', apiKey, counter);
    throwOnTornError(allTimeRes?.raw?.error);
    const untilLastMonthRes = await fetchUserPersonalStatV2(
        playerId,
        'xantaken',
        apiKey,
        counter,
        monthAgoTimestamp,
    );
    throwOnTornError(untilLastMonthRes?.raw?.error);

    const allTimeXanaxTaken = toFiniteNumber(allTimeRes.value);
    const xanaxTakenUntilLastMonth = toFiniteNumber(untilLastMonthRes.value);
    let xanaxTakenDuringLastMonth = null;
    if (allTimeXanaxTaken != null && xanaxTakenUntilLastMonth != null) {
        xanaxTakenDuringLastMonth = Math.max(0, allTimeXanaxTaken - xanaxTakenUntilLastMonth);
    }

    return {
        allTimeXanaxTaken,
        xanaxTakenUntilLastMonth,
        xanaxTakenDuringLastMonth,
        periodIsWindowed: xanaxTakenDuringLastMonth != null,
    };
}

function buildResult(id, profileData, scores, counter, ageDays, xanaxStats) {
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
    const factionNameFromProfile = extractFactionNameFromProfile(profileData);
    const companyId = extractCompanyId(profileData);
    const companyNameFromProfile = extractCompanyNameFromProfile(profileData);

    return {
        playerId: Number(id),
        name,
        level,
        ageDays: ageDays != null ? Number(ageDays) : null,
        ageMonths: ageDays != null ? Number((ageDays / AVG_DAYS_PER_MONTH).toFixed(2)) : null,
        ageYears: ageDays != null ? Number((ageDays / 365.25).toFixed(2)) : null,
        hasFaction,
        hasCompany,
        factionName: factionNameFromProfile ?? null,
        companyName: companyNameFromProfile ?? null,
        hoursSinceLastAction: Number(hoursSinceLastAction.toFixed(2)),
        xanScore: Number(xanScorePct.toFixed(2)),
        tier,
        avgXanaxPerDay: scores.avgXanaxPerDay != null ? Number(scores.avgXanaxPerDay.toFixed(4)) : null,
        allTimeXanaxTaken: xanaxStats.allTimeXanaxTaken,
        xanaxTakenUntilLastMonth: xanaxStats.xanaxTakenUntilLastMonth,
        xanaxTakenDuringLastMonth: xanaxStats.xanaxTakenDuringLastMonth,
        statsAvailable: Boolean(scores.statsAvailable),
        periodUsed: 'month',
        periodIsWindowed: xanaxStats.periodIsWindowed,
        xanaxMode: 'v2-monthly-delta',
        tornApiCallsUsed: counter.value,
        _factionId: factionId,
        _factionNameFromProfile: factionNameFromProfile,
        _companyId: companyId,
        _companyNameFromProfile: companyNameFromProfile,
    };
}

async function getActiveRankedPlayerById(playerId) {
    const apiKey = process.env.TORN_API_KEY;
    if (playerId == null || playerId === '') throw new Error('playerId is required.');

    const normalizedId = Number(playerId);
    if (!Number.isFinite(normalizedId) || normalizedId <= 0) {
        throw new Error(`Invalid playerId: ${playerId}`);
    }

    const counter = { value: 0 };
    const profileRes = await fetchUser(normalizedId, 'profile', apiKey, counter);
    if (profileRes?.error) throwOnTornError(profileRes.error);
    const profileData = profileRes.profile != null ? profileRes.profile : profileRes;

    const ageDays = extractAgeDays(profileData);
    const xanaxStats = await fetchMonthlyXanaxStats(normalizedId, apiKey, counter);
    const scores = computeScores({
        xanaxTakenTotal: xanaxStats.allTimeXanaxTaken,
        xanaxTakenForPeriod: xanaxStats.xanaxTakenDuringLastMonth,
        ageDays,
        period: 'month',
    });

    const result = buildResult(normalizedId, profileData, scores, counter, ageDays, xanaxStats);

    result.factionName = result._factionNameFromProfile ?? (result._factionId
        ? await fetchFactionName(result._factionId, apiKey, counter)
        : null);
    result.companyName = result._companyNameFromProfile ?? (result._companyId
        ? await fetchCompanyName(result._companyId, apiKey, counter)
        : null);

    delete result._factionId;
    delete result._factionNameFromProfile;
    delete result._companyId;
    delete result._companyNameFromProfile;
    result.tornApiCallsUsed = counter.value;
    return result;
}

module.exports = {
    getActiveRankedPlayerById,
};

