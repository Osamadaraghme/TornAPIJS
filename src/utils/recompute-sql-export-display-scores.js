/**
 * Recompute xan / time / combined / tier (and derived averages) for saved export rows
 * using current admin scoring constants. Mutates each row object in place.
 */

const { getMergedConstants } = require('../constants.js');
const {
    computeScores,
    computeTimePlayedScoreFromMonthlySeconds,
    combinedRecruitmentScore01,
    tierForFinalScore,
} = require('./scoring.js');

function asFiniteNumber(v) {
    if (v === null || v === undefined) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

/**
 * @param {Record<string, unknown>} row
 * @returns {boolean} whether scoring inputs look like a TornAPIJS recruitment export row
 */
function rowLooksLikePlayerStatsExport(row) {
    if (!row || typeof row !== 'object') return false;
    const pid = asFiniteNumber(row.playerId);
    if (pid == null || pid <= 0) return false;
    return (
        Object.prototype.hasOwnProperty.call(row, 'xanScore')
        && Object.prototype.hasOwnProperty.call(row, 'combinedScore')
    );
}

/**
 * @param {Record<string, unknown>} row
 */
function recomputePlayerStatsExportRow(row) {
    if (!rowLooksLikePlayerStatsExport(row)) return;

    const periodRaw = String(row.periodUsed ?? 'month').toLowerCase();
    const period = periodRaw === 'day' ? 'day' : 'month';

    const ageDays = asFiniteNumber(row.ageDays);
    const allTimeXanax = asFiniteNumber(row.allTimeXanaxTaken);
    const xanDuringLastMonth = asFiniteNumber(row.xanaxTakenDuringLastMonth);
    const timePlayedLastMonthSec = asFiniteNumber(row.timePlayedDuringLastMonth);

    let xanForPeriod = xanDuringLastMonth;
    if (period === 'day') {
        // Day-window exports store the window total as per-day xan in scoring.js path.
        xanForPeriod = xanDuringLastMonth;
    }

    const scores = computeScores({
        xanaxTakenTotal: allTimeXanax,
        xanaxTakenForPeriod: xanForPeriod,
        ageDays,
        period,
    });
    const timeScoring = computeTimePlayedScoreFromMonthlySeconds(timePlayedLastMonthSec);
    const combined01 = combinedRecruitmentScore01(scores.xanScore, timeScoring.timeScore);
    const combinedPct = combined01 * 100;
    const tier = tierForFinalScore(combinedPct);

    row.xanScore = Number((scores.xanScore * 100).toFixed(2));
    row.averageTimeScore = Number((timeScoring.timeScore * 100).toFixed(2));
    row.combinedScore = Number(combinedPct.toFixed(2));
    row.tier = tier;
    row.avgXanaxPerDay =
        scores.avgXanaxPerDay != null ? Number(scores.avgXanaxPerDay.toFixed(4)) : null;
    row.avgTimePlayedHoursPerDay =
        timeScoring.avgHoursPerDay != null ? Number(timeScoring.avgHoursPerDay.toFixed(4)) : null;

    const { AVG_DAYS_PER_MONTH } = getMergedConstants();
    if (ageDays != null && ageDays > 0) {
        row.ageMonths = Number((ageDays / AVG_DAYS_PER_MONTH).toFixed(2));
        row.ageYears = Number((ageDays / 365.25).toFixed(2));
    }
}

/**
 * @param {Record<string, unknown>[]|null|undefined} rows
 */
function applyCurrentScoringToExportRows(rows) {
    if (!Array.isArray(rows) || !rows.length) return;
    for (const row of rows) {
        try {
            recomputePlayerStatsExportRow(row);
        } catch {
            /* leave row unchanged if a row is malformed */
        }
    }
}

module.exports = {
    applyCurrentScoringToExportRows,
    recomputePlayerStatsExportRow,
};
