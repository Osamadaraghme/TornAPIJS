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
 * Compute xanax score and averages for a given period.
 *
 * Behavior:
 * - If Torn provides a period-specific xanax total in `personalstats`, we use it.
 * - Otherwise we fall back to the lifetime total divided by account age.
 *
 * @param {{ xanaxTakenTotal: number|null, xanaxTakenForPeriod: number|null, ageDays: number|null, period: 'day'|'month', avgXanaxPerDayMultiplier?: number }} opts
 * @returns {{ xanScore: number, finalScore: number, periodUsed: string, avgXanaxPerDay: number|null, avgXanaxPerMonth: number|null, statsAvailable: boolean }}
 */
function computeScores({
    xanaxTakenTotal,
    xanaxTakenForPeriod,
    ageDays,
    period,
    avgXanaxPerDayMultiplier = 1,
}) {
    const safeAgeDays = Number.isFinite(ageDays) && ageDays > 0 ? ageDays : null;
    const usingMonth = period === 'month';

    let avgXanPerDay = null;

    // If Torn provides a window-specific xanax intake field, prefer it.
    if (Number.isFinite(xanaxTakenForPeriod)) {
        avgXanPerDay = usingMonth
            ? xanaxTakenForPeriod / AVG_DAYS_PER_MONTH
            : xanaxTakenForPeriod; // assume per-day window
    } else if (Number.isFinite(xanaxTakenTotal) && safeAgeDays) {
        // Fallback: lifetime avg per day (original behavior).
        avgXanPerDay = xanaxTakenTotal / safeAgeDays;
    }

    if (Number.isFinite(avgXanaxPerDayMultiplier) && avgXanPerDay != null) {
        avgXanPerDay = avgXanPerDay * avgXanaxPerDayMultiplier;
    }

    if (avgXanPerDay == null) {
        return {
            xanScore: 0,
            finalScore: 0,
            periodUsed: period,
            avgXanaxPerDay: null,
            avgXanaxPerMonth: null,
            statsAvailable: false,
        };
    }

    const avgXanPerMonth = avgXanPerDay * AVG_DAYS_PER_MONTH;

    // Scores in 0–1; caller may scale to 0–100.
    const xanScore = clamp01(avgXanPerDay / XANAX_PER_DAY_FOR_FULL_SCORE);
    const finalScore = xanScore;
    const statsAvailable = avgXanPerDay != null;

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
