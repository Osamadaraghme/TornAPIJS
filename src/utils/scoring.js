/**
 * Xanax-based scoring and tier (S/A/B/C/D) logic.
 * Formula: XanScore = min((avg xanax per day) / XANAX_PER_DAY_FOR_FULL_SCORE, 1) * 100; tier from score.
 */

const { AVG_DAYS_PER_MONTH, XANAX_PER_DAY_FOR_FULL_SCORE } = require('../constants.js');

/** Clamp a number to [0, 1]. */
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
    const xanDenom = usingMonth ? (XANAX_PER_DAY_FOR_FULL_SCORE * AVG_DAYS_PER_MONTH) : XANAX_PER_DAY_FOR_FULL_SCORE;
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
    if (finalScore0to100 >= 75) return 'S';
    if (finalScore0to100 >= 60) return 'A';
    if (finalScore0to100 >= 40) return 'B';
    if (finalScore0to100 >= 25) return 'C';
    return 'D';
}

/** Tier order for "or higher" filter: S > A > B > C > D. */
const TIER_RANK = { S: 4, A: 3, B: 2, C: 1, D: 0 };

/** Valid tier filter values (excluding ALL). */
const VALID_TIERS = Object.keys(TIER_RANK);

/**
 * True if playerTier is the same or better than minTier (e.g. B is at or above C).
 * @param {string} playerTier - Player's tier (S/A/B/C/D)
 * @param {string} minTier - Minimum tier requested (S/A/B/C/D)
 */
function isTierAtOrAbove(playerTier, minTier) {
    const p = TIER_RANK[String(playerTier).toUpperCase()];
    const m = TIER_RANK[String(minTier).toUpperCase()];
    if (p == null || m == null) return false;
    return p >= m;
}

module.exports = {
    computeScores,
    tierForFinalScore,
    isTierAtOrAbove,
    VALID_TIERS,
};
