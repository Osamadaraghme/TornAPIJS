/**
 * Service: random ACTIVE player with month-delta xanax scoring.
 * Month values are computed from Torn v2 cumulative snapshots:
 * duringLastMonth = allTime - untilLastMonth.
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
const { computeScores, tierForFinalScore, isTierAtOrAbove, VALID_TIERS } = require('../utils/scoring.js');
const { messageForTornError, buildNoPlayerFoundError } = require('../utils/errors.js');
const { TORN_FATAL_ERROR_CODES, AVG_DAYS_PER_MONTH } = require('../constants.js');
const { randomIntInclusive } = require('../utils/helpers.js');

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

function parseOptions(opts) {
    return {
        activeWithinHours: Number.isFinite(opts.activeWithinHours) ? opts.activeWithinHours : 24,
        minId: Number.isFinite(opts.minId) ? opts.minId : 1,
        maxId: Number.isFinite(opts.maxId) ? opts.maxId : 3000000,
        maxTries: Number.isFinite(opts.maxTries) ? opts.maxTries : 60,
        desiredTier: (typeof opts.tier === 'string' ? opts.tier : 'ALL').toUpperCase(),
        factionFilter: (typeof opts.hasFaction === 'string' ? opts.hasFaction : 'ANY').toUpperCase(),
        companyFilter: (typeof opts.hasCompany === 'string' ? opts.hasCompany : 'ANY').toUpperCase(),
        minLevel: Number.isFinite(opts.minLevel) && opts.minLevel >= 0 ? opts.minLevel : null,
    };
}

function passesFactionCompanyFilters(profileData, factionFilter, companyFilter) {
    const hasFaction = hasFactionFromProfile(profileData);
    const hasCompany = hasCompanyFromProfile(profileData);
    if (factionFilter === 'Y' && !hasFaction) return false;
    if (factionFilter === 'N' && hasFaction) return false;
    if (companyFilter === 'Y' && !hasCompany) return false;
    if (companyFilter === 'N' && hasCompany) return false;
    return true;
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

async function getRandomActiveRankedPlayer(apiKey, opts = {}) {
    const {
        activeWithinHours,
        minId,
        maxId,
        maxTries,
        desiredTier,
        factionFilter,
        companyFilter,
        minLevel,
    } = parseOptions(opts);

    const counter = { value: 0 };
    const runStats = { profilesOk: 0, activeCount: 0, passedFiltersCount: 0, lastTornError: null };
    const nowSeconds = Math.floor(Date.now() / 1000);
    const cutoff = nowSeconds - Math.floor(activeWithinHours * 3600);

    for (let i = 0; i < maxTries; i++) {
        const id = randomIntInclusive(minId, maxId);
        const data = await fetchUser(id, 'profile', apiKey, counter);

        if (data?.error) {
            runStats.lastTornError = messageForTornError(data.error);
            const code = data.error?.code ?? data.error?.error_code;
            if (code != null && TORN_FATAL_ERROR_CODES.has(Number(code))) {
                throw new Error(runStats.lastTornError || `Torn API error (code ${code}).`);
            }
            continue;
        }
        runStats.profilesOk++;

        const profileData = data.profile != null ? data.profile : data;
        const lastActionTs = extractLastActionTimestampSeconds(profileData);
        if (!lastActionTs || lastActionTs < cutoff) continue;
        runStats.activeCount++;

        if (!passesFactionCompanyFilters(profileData, factionFilter, companyFilter)) continue;

        if (minLevel != null) {
            const level = extractLevel(profileData);
            if (level == null || level < minLevel) continue;
        }
        runStats.passedFiltersCount++;

        const ageDays = extractAgeDays(profileData);
        const xanaxStats = await fetchMonthlyXanaxStats(id, apiKey, counter);
        const scores = computeScores({
            xanaxTakenTotal: xanaxStats.allTimeXanaxTaken,
            xanaxTakenForPeriod: xanaxStats.xanaxTakenDuringLastMonth,
            ageDays,
            period: 'month',
        });

        const tier = tierForFinalScore(scores.finalScore * 100);
        if (VALID_TIERS.includes(desiredTier) && !isTierAtOrAbove(tier, desiredTier)) {
            continue;
        }

        const result = buildResult(id, profileData, scores, counter, ageDays, xanaxStats);
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

    throw buildNoPlayerFoundError(runStats, { maxTries, activeWithinHours, desiredTier }, counter);
}

module.exports = {
    getRandomActiveRankedPlayer,
};

