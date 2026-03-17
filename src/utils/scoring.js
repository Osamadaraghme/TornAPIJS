/**
 * Xanax-based scoring and tier (S/A/B/C/D) logic.
 * Formula: XanScore = min((avg xanax per day)/4, 1) * 100; tier from score.
 */

const { AVG_DAYS_PER_MONTH } = require('../constants.js');

function clamp01(x) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    return x;
}

/**
 * Compute xanax score and averages from lifetime stats and account age.
 * @param {{ xanaxTakenTotal: number|null, ageDays: number|null, period: 'day'|'month' }} opts
 * @returns {{ xanScore: number, finalScore: number, periodUsed: string, avgXanaxPerDay: number|null, avgXanaxPerMonth: number|null, statsAvailable: boolean }}
 */
function computeScores({ xanaxTakenTotal, ageDays, period }) {
    const safeAgeDays = Number.isFinite(ageDays) && ageDays > 0 ? ageDays : null;
    if (!safeAgeDays) {
        return {
            xanScore: 0,
            finalScore: 0,
            periodUsed: period,
            avgXanaxPerDay: null,
            avgXanaxPerMonth: null,
            statsAvailable: false,
        };
    }

    const avgXanPerDay = Number.isFinite(xanaxTakenTotal) ? (xanaxTakenTotal / safeAgeDays) : null;
    const usingMonth = period === 'month';
    const xanDenom = usingMonth ? (4 * AVG_DAYS_PER_MONTH) : 4;
    const avgXanPeriod = avgXanPerDay == null ? null : (usingMonth ? (avgXanPerDay * AVG_DAYS_PER_MONTH) : avgXanPerDay);
    const avgXanPerMonth = avgXanPerDay == null ? null : avgXanPerDay * AVG_DAYS_PER_MONTH;

    // Scores in 0–1; caller may scale to 0–100
    const xanScore = avgXanPeriod == null ? 0 : clamp01(avgXanPeriod / xanDenom);
    const finalScore = xanScore;
    const statsAvailable = avgXanPeriod != null;

    return {
        xanScore,
        finalScore,
        periodUsed: period,
        avgXanaxPerDay: avgXanPerDay,
        avgXanaxPerMonth: avgXanPerMonth,
        statsAvailable,
    };
}

/**
 * Map a 0–100 score to tier S/A/B/C/D.
 * @param {number} finalScore0to100
 * @returns {'S'|'A'|'B'|'C'|'D'}
 */
function tierForFinalScore(finalScore0to100) {
    if (finalScore0to100 >= 90) return 'S';
    if (finalScore0to100 >= 75) return 'A';
    if (finalScore0to100 >= 60) return 'B';
    if (finalScore0to100 >= 40) return 'C';
    return 'D';
}

module.exports = {
    computeScores,
    tierForFinalScore,
};
