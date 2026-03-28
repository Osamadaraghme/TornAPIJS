/**
 * Service: random ACTIVE player with month-delta xanax scoring; SQL append entry point only.
 * Month values are computed from Torn v2 cumulative snapshots:
 * duringLastMonth = allTime - untilLastMonth.
 */

const {
    fetchUser,
    fetchFactionName,
    fetchCompanyName,
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
const {
    computeScores,
    computeTimePlayedScoreFromMonthlySeconds,
    combinedRecruitmentScore01,
    tierForFinalScore,
    isTierAtOrAbove,
    VALID_TIERS,
} = require('../utils/scoring.js');
const { messageForTornError, buildNoPlayerFoundError } = require('../utils/errors.js');
const {
    TORN_FATAL_ERROR_CODES,
    AVG_DAYS_PER_MONTH,
    DEFAULT_RANDOM_STATS_SQL_PATH,
} = require('../constants.js');
const { appendSqlRow } = require('../utils/sql-append.js');
const { CSV_HEADERS, buildPlayerStatsCsvRow } = require('../models/player-stats-csv-model.js');
const { fetchMonthlyV2RecruitmentStats } = require('../utils/monthly-v2-recruitment-stats.js');
const { randomIntInclusive } = require('../utils/helpers.js');

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

function buildResult(id, profileData, scores, snap, timeScoring, combined01, counter, ageDays) {
    const name = extractName(profileData);
    const level = extractLevel(profileData);
    const hasFaction = hasFactionFromProfile(profileData);
    const hasCompany = hasCompanyFromProfile(profileData);
    const nowSeconds = Math.floor(Date.now() / 1000);
    const lastActionTs = extractLastActionTimestampSeconds(profileData);
    const hoursSinceLastAction = (nowSeconds - lastActionTs) / 3600;

    const xanScorePct = scores.xanScore * 100;
    const averageTimeScorePct = timeScoring.timeScore * 100;
    const combinedScorePct = combined01 * 100;
    const tier = tierForFinalScore(combinedScorePct);

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
        averageTimeScore: Number(averageTimeScorePct.toFixed(2)),
        combinedScore: Number(combinedScorePct.toFixed(2)),
        tier,
        avgXanaxPerDay: scores.avgXanaxPerDay != null ? Number(scores.avgXanaxPerDay.toFixed(4)) : null,
        avgTimePlayedHoursPerDay:
            timeScoring.avgHoursPerDay != null ? Number(timeScoring.avgHoursPerDay.toFixed(4)) : null,
        allTimeXanaxTaken: snap.allTimeXanaxTaken,
        xanaxTakenUntilLastMonth: snap.xanaxTakenUntilLastMonth,
        xanaxTakenDuringLastMonth: snap.xanaxTakenDuringLastMonth,
        timePlayed: snap.allTimeTimePlayed,
        timePlayedUntilLastMonth: snap.timePlayedUntilLastMonth,
        timePlayedDuringLastMonth: snap.timePlayedDuringLastMonth,
        activeStreak: snap.activeStreak,
        statsAvailable: Boolean(scores.statsAvailable),
        periodUsed: 'month',
        periodIsWindowed: snap.xanaxTakenDuringLastMonth != null,
        xanaxMode: 'v2-recruitment-stats',
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
        const snap = await fetchMonthlyV2RecruitmentStats(id, apiKey, counter);
        const scores = computeScores({
            xanaxTakenTotal: snap.allTimeXanaxTaken,
            xanaxTakenForPeriod: snap.xanaxTakenDuringLastMonth,
            ageDays,
            period: 'month',
        });
        const timeScoring = computeTimePlayedScoreFromMonthlySeconds(snap.timePlayedDuringLastMonth);
        const combined01 = combinedRecruitmentScore01(scores.xanScore, timeScoring.timeScore);
        const tier = tierForFinalScore(combined01 * 100);
        if (VALID_TIERS.includes(desiredTier) && !isTierAtOrAbove(tier, desiredTier)) {
            continue;
        }

        const result = buildResult(
            id,
            profileData,
            scores,
            snap,
            timeScoring,
            combined01,
            counter,
            ageDays,
        );
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

/**
 * Fetch one random active ranked player and append one INSERT row to a .sql file.
 * @param {string|string[]|undefined} apiKey - Optional key override/key pool
 * @param {object} [options]
 * @param {string} [options.sqlPath] - Output .sql path
 * @param {string} [options.csvPath] - Deprecated alias for sqlPath
 * @returns {Promise<{ path: string, created: boolean, data: object }>}
 */
async function getRandomActiveRankedPlayerToSql(apiKey, options = {}) {
    const sqlPath = options.sqlPath
        ?? options.csvPath
        ?? process.env.TORN_RANDOM_STATS_SQL
        ?? process.env.TORN_RANDOM_STATS_CSV
        ?? process.env.TORN_STATS_SQL
        ?? process.env.TORN_STATS_CSV
        ?? DEFAULT_RANDOM_STATS_SQL_PATH;

    const stats = await getRandomActiveRankedPlayer(apiKey, options);

    const row = buildPlayerStatsCsvRow(stats);

    const { path: resolvedPath, created } = appendSqlRow(sqlPath, CSV_HEADERS, row);
    return { path: resolvedPath, created, data: stats };
}

module.exports = {
    getRandomActiveRankedPlayerToSql,
};

