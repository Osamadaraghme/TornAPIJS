/**
 * Service: active-ranked player by ID — stats fetch plus SQL append API.
 * Xanax month values are sourced from Torn v2 cumulative `xantaken` snapshots:
 * - all-time:      /v2/user/:id/personalstats?stat=xantaken
 * - until last mo: /v2/user/:id/personalstats?stat=xantaken&timestamp=...
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
} = require('../utils/scoring.js');
const { messageForTornError } = require('../utils/errors.js');
const { TORN_FATAL_ERROR_CODES, AVG_DAYS_PER_MONTH, DEFAULT_BY_ID_STATS_SQL_PATH } = require('../constants.js');
const { fetchMonthlyV2RecruitmentStats } = require('../utils/monthly-v2-recruitment-stats.js');
const { appendSqlRow } = require('../utils/sql-append.js');
const { CSV_HEADERS, buildPlayerStatsCsvRow } = require('../models/player-stats-csv-model.js');

function throwOnTornError(errorObj) {
    if (!errorObj) return;
    const message = messageForTornError(errorObj);
    const code = errorObj?.code ?? errorObj?.error_code;
    if (code != null && TORN_FATAL_ERROR_CODES.has(Number(code))) {
        throw new Error(message || `Torn API error (code ${code}).`);
    }
    throw new Error(message || 'Torn API error.');
}

function buildResult(id, profileData, scores, snap, timeScoring, combined01, counter, ageDays) {
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
    const snap = await fetchMonthlyV2RecruitmentStats(normalizedId, apiKey, counter);
    const scores = computeScores({
        xanaxTakenTotal: snap.allTimeXanaxTaken,
        xanaxTakenForPeriod: snap.xanaxTakenDuringLastMonth,
        ageDays,
        period: 'month',
    });
    const timeScoring = computeTimePlayedScoreFromMonthlySeconds(snap.timePlayedDuringLastMonth);
    const combined01 = combinedRecruitmentScore01(scores.xanScore, timeScoring.timeScore);

    const result = buildResult(
        normalizedId,
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

/**
 * Fetch player stats and append them as one INSERT row in a .sql file.
 * @param {number|string} playerId - Torn user ID
 * @param {object} [options]
 * @param {string} [options.sqlPath] - Output .sql path
 * @param {string} [options.csvPath] - Deprecated alias for sqlPath
 * @returns {Promise<{ path: string, created: boolean, data: object }>}
 */
async function getActiveRankedPlayerByIdToSql(playerId, options = {}) {
    const sqlPath = options.sqlPath
        ?? options.csvPath
        ?? process.env.TORN_BY_ID_STATS_SQL
        ?? process.env.TORN_BY_ID_STATS_CSV
        ?? process.env.TORN_STATS_SQL
        ?? process.env.TORN_STATS_CSV
        ?? DEFAULT_BY_ID_STATS_SQL_PATH;

    const stats = await getActiveRankedPlayerById(playerId);

    const row = buildPlayerStatsCsvRow(stats);

    const { path: resolvedPath, created } = appendSqlRow(sqlPath, CSV_HEADERS, row);

    return {
        path: resolvedPath,
        created,
        data: stats,
    };
}

module.exports = {
    getActiveRankedPlayerById,
    getActiveRankedPlayerByIdToSql,
    CSV_HEADERS,
};

