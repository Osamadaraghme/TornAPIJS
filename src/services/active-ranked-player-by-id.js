/**
 * Service: active-ranked player by ID (recruitment scoring).
 *
 * Returns the same response shape as `active-ranked-player`, but for a
 * specific `playerId` without random probing or filtering.
 *
 * Signature: `getActiveRankedPlayerById(playerId)` (API key is read from
 * `process.env.TORN_API_KEY`).
 */

const { fetchUser, fetchFactionName, fetchCompanyName, fetchUserPersonalStatV2 } = require('../api/torn-client.js');
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
    extractXanaxTaken,
    extractXanaxTakenForPeriod,
} = require('../utils/extractors.js');
const { computeScores, tierForFinalScore } = require('../utils/scoring.js');
const { messageForTornError } = require('../utils/errors.js');
const { TORN_FATAL_ERROR_CODES, AVG_DAYS_PER_MONTH } = require('../constants.js');

/**
 * Build the success response object for one matched player.
 * @param {number|string} id - Player ID
 * @param {object} profileData - Normalised profile from API
 * @param {object} scores - Output from computeScores
 * @param {string} period - 'day' or 'month'
 * @param {object|null} ps - Personal stats object (or null)
 * @param {{ value: number }} counter - API call counter
 * @returns {object} Result shape; factionName/companyName filled by caller
 */
function buildResult(id, profileData, scores, period, ps, counter, ageDays, xanTakenTotal, xanTakenLastMonth) {
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
    const companyId = extractCompanyId(profileData);
    const companyNameFromProfile = extractCompanyNameFromProfile(profileData);
    const lastMonthDelta = (Number.isFinite(xanTakenTotal) && Number.isFinite(xanTakenLastMonth))
        ? Math.max(0, xanTakenTotal - xanTakenLastMonth)
        : null;

    return {
        playerId: Number(id),
        name,
        level,
        ageDays: ageDays != null ? Number(ageDays) : null,
        ageMonths: ageDays != null ? Number((ageDays / AVG_DAYS_PER_MONTH).toFixed(2)) : null,
        ageYears: ageDays != null ? Number((ageDays / 365.25).toFixed(2)) : null,
        hasFaction,
        hasCompany,
        factionName: null, // filled below after async fetches
        companyName: companyNameFromProfile ?? null,
        hoursSinceLastAction: Number(hoursSinceLastAction.toFixed(2)),
        xanScore: Number(xanScorePct.toFixed(2)),
        tier,
        avgXanaxPerDay: scores.avgXanaxPerDay != null ? Number(scores.avgXanaxPerDay.toFixed(4)) : null,
        totalXanaxAllTime: xanTakenTotal != null ? Number(xanTakenTotal) : null,
        totalXanaxLastMonth: xanTakenLastMonth != null ? Number(xanTakenLastMonth) : null,
        avgLastMonth: lastMonthDelta != null ? Number((lastMonthDelta / AVG_DAYS_PER_MONTH).toFixed(4)) : null,
        statsAvailable: Boolean(scores.statsAvailable) && Boolean(ps),
        periodUsed: period,
        tornApiCallsUsed: counter.value,
        _factionId: factionId,
        _companyId: companyId,
        _companyNameFromProfile: companyNameFromProfile,
    };
}

/**
 * Get a specific Torn player, scored and tiered.
 * @param {number|string} playerId - Torn user ID
 * @returns {Promise<object>} Player result including tornApiCallsUsed
 */
async function getActiveRankedPlayerById(playerId) {
    const apiKey = process.env.TORN_API_KEY;
    if (!apiKey) throw new Error('Torn API key is required (set process.env.TORN_API_KEY).');
    if (playerId == null || playerId === '') throw new Error('playerId is required.');

    const normalizedId = Number(playerId);
    if (!Number.isFinite(normalizedId) || normalizedId <= 0) {
        throw new Error(`Invalid playerId: ${playerId}`);
    }

    // Recruitment-friendly default: month (matches most of your usage).
    const period = process.env.TORN_SCORE_PERIOD === 'day' ? 'day' : 'month';
    const xanaxMode = String(process.env.TORN_XANAX_MODE || 'fast').toLowerCase() === 'probe' ? 'probe' : 'fast';
    const nowSeconds = Math.floor(Date.now() / 1000);
    const debug = process.env.TORN_DEBUG_XANAX_WINDOW === '1';
    const counter = { value: 0 };
    const USER_SELECTIONS = 'profile,personalstats';

    // Request windowed personalstats.
    // Torn API docs say from/to are UNIX timestamps for filtering some selections.
    const personalStatsFrom = period === 'month'
        ? nowSeconds - Math.floor(AVG_DAYS_PER_MONTH * 86400)
        : nowSeconds - 86400;
    const personalStatsTo = nowSeconds;
    const personalStatsParams = {
        stats: 'useractivity',
        stat: 'xantaken',
        from: personalStatsFrom,
        to: personalStatsTo,
    };

    const windowData = await fetchUser(
        normalizedId,
        USER_SELECTIONS,
        apiKey,
        counter,
        personalStatsParams,
    );

    if (windowData?.error) {
        const message = messageForTornError(windowData.error);
        const code = windowData.error?.code ?? windowData.error?.error_code;
        if (code != null && TORN_FATAL_ERROR_CODES.has(Number(code))) {
            throw new Error(message || `Torn API error (code ${code}).`);
        }
        throw new Error(message || `Torn API error.`);
    }

    const profileData = windowData.profile != null ? windowData.profile : windowData;
    const psWindow = windowData?.personalstats != null
        ? (windowData.personalstats.personalstats ?? windowData.personalstats)
        : null;

    // Fast/default path: use a single user call for by-id scoring.
    // If Torn doesn't expose a window field, this falls back to lifetime stats from
    // the same payload; no extra probing calls by default.
    let xanTakenTotal = psWindow ? extractXanaxTaken(psWindow) : null;
    const xanTakenWindow = psWindow ? extractXanaxTaken(psWindow) : null;
    let xanTakenForPeriod = psWindow ? extractXanaxTakenForPeriod(psWindow, period) : null;

    let periodIsWindowed = xanTakenForPeriod != null;
    let psForPeriod = psWindow;
    let xanTakenLastMonth = null;

    // Optional heavy probe mode (disabled by default to minimize API calls).
    // Enable with `TORN_XANAX_MODE=probe` for deeper troubleshooting.
    const enableProbes = xanaxMode === 'probe';
    let psLifetime = null;
    if (enableProbes && !periodIsWindowed && period === 'month') {
        // Baseline lifetime personalstats (no from/to) for comparisons.
        const lifetimeData = await fetchUser(
            normalizedId,
            USER_SELECTIONS,
            apiKey,
            counter,
        );

        if (lifetimeData?.error) {
            const message = messageForTornError(lifetimeData.error);
            const code = lifetimeData.error?.code ?? lifetimeData.error?.error_code;
            if (code != null && TORN_FATAL_ERROR_CODES.has(Number(code))) {
                throw new Error(message || `Torn API error (code ${code}).`);
            }
            throw new Error(message || `Torn API error.`);
        }

        psLifetime = lifetimeData?.personalstats != null
            ? (lifetimeData.personalstats.personalstats ?? lifetimeData.personalstats)
            : null;
        const lifetimeXan = psLifetime ? extractXanaxTaken(psLifetime) : null;

        if (!periodIsWindowed
            && Number.isFinite(xanTakenWindow)
            && Number.isFinite(lifetimeXan)
            && xanTakenWindow !== lifetimeXan) {
            xanTakenForPeriod = xanTakenWindow;
            periodIsWindowed = true;
        }

        const personalStatsFromMonth = personalStatsFrom;
        const personalStatsToMonth = personalStatsTo;

        const probeQueries = [
            // Sometimes "window" is encoded in the stat name rather than from/to.
            { cat: 'useractivity', stat: 'xantaken_30' },
            { cat: 'useractivity', stat: 'xantaken30' },
            { cat: 'useractivity', stat: 'xantaken_1m' },
            { cat: 'useractivity', stat: 'xantaken1m' },
            { cat: 'useractivity', stat: 'xantaken_30d' },
            { cat: 'useractivity', stat: 'xantaken30d' },
            { cat: 'useractivity', stat: 'xantaken_last_month' },
            { cat: 'useractivity', stat: 'xantaken_last30' },
            // As a secondary fallback, omit `stat` entirely and let Torn return
            // all useractivity stats for the period window (if it supports that).
            { cat: 'useractivity', from: personalStatsFromMonth, to: personalStatsToMonth },
            { stats: 'useractivity', from: '1 month' },
        ];

        for (const queryParams of probeQueries) {
            if (debug) {
                console.log('[debug] probing personalstats with params:', queryParams);
            }
            const probeData = await fetchUser(
                normalizedId,
                USER_SELECTIONS,
                apiKey,
                counter,
                queryParams,
            );

            if (probeData?.error) continue;

            const psProbe = probeData?.personalstats != null
                ? (probeData.personalstats.personalstats ?? probeData.personalstats)
                : null;
            if (!psProbe || typeof psProbe !== 'object') continue;

            const extracted = extractXanaxTakenForPeriod(psProbe, period);
            const extractedValue = extracted != null ? extracted : extractXanaxTaken(psProbe);

            if (debug) {
                const xanKeysProbe = Object.keys(psProbe).filter((k) => /xantaken|xanax[_-]?taken/i.test(k.toLowerCase()));
                console.log('[debug] probe xan keys:', xanKeysProbe);
                console.log('[debug] probe xantaken =', extractXanaxTaken(psProbe));
                console.log('[debug] probe extractXanaxTakenForPeriod =', extracted);
                console.log('[debug] probe extractedValue (used) =', extractedValue);
            }

            // Accept if we found a month-like field OR if `xantaken` changes when probing.
            if (extracted != null) {
                xanTakenForPeriod = extracted;
                periodIsWindowed = true;
                psForPeriod = psProbe;
                if (debug) {
                    console.log('[debug] probe accepted (month-like field found).');
                }
                break;
            }

            if (!periodIsWindowed
                && Number.isFinite(lifetimeXan)
                && Number.isFinite(extractedValue)
                && extractedValue !== lifetimeXan) {
                xanTakenForPeriod = extractedValue;
                periodIsWindowed = true;
                psForPeriod = psProbe;
                if (debug) {
                    console.log('[debug] probe accepted (xantaken value changed).');
                }
                break;
            }
        }
    }

    if (debug && psWindow && typeof psWindow === 'object') {
        const xanKeysLifetime = psLifetime
            ? Object.keys(psLifetime).filter((k) => /xantaken|xanax[_-]?taken/i.test(k.toLowerCase()))
            : [];
        const xanKeysWindow = psWindow
            ? Object.keys(psWindow).filter((k) => /xantaken|xanax[_-]?taken/i.test(k.toLowerCase()))
            : [];

        console.log('[debug] lifetime personalstats xanax keys:', xanKeysLifetime);
        console.log('[debug] lifetime xantaken =', extractXanaxTaken(psLifetime));

        console.log('[debug] window personalstats xanax keys:', xanKeysWindow);
        for (const k of xanKeysWindow) {
            const v = psWindow[k];
            if (v == null) continue;
            if (typeof v === 'object') continue;
            console.log(`[debug] window ${k} =`, v);
        }
        console.log('[debug] extractXanaxTakenForPeriod (used) =', extractXanaxTakenForPeriod(psForPeriod, period));
        console.log('[debug] period =', period, 'params =', personalStatsParams);
        console.log('[debug] xanTakenTotal(lifetime) =', xanTakenTotal);
        console.log('[debug] xanTakenWindow =', xanTakenWindow);
        console.log('[debug] xanTakenForPeriod =', xanTakenForPeriod);
        console.log('[debug] periodIsWindowed =', periodIsWindowed);
        console.log('[debug] xanax mode TORN_XANAX_MODE =', xanaxMode);
    }

    // Accurate last-month xanax via Torn v2 personalstats timestamp query.
    // Keep all-time total from the existing user payload to avoid an extra call.
    let v2LastMonth = null;
    try {
        const lastMonthResp = await fetchUserPersonalStatV2(normalizedId, 'xantaken', apiKey, counter, personalStatsFrom);
        v2LastMonth = lastMonthResp.value;
    } catch {
        // keep null
    }
    if (Number.isFinite(v2LastMonth)) {
        xanTakenLastMonth = v2LastMonth;
        const lastMonthDelta = Number.isFinite(xanTakenTotal)
            ? Math.max(0, xanTakenTotal - v2LastMonth)
            : null;
        if (period === 'month' && Number.isFinite(lastMonthDelta)) {
            xanTakenForPeriod = lastMonthDelta;
            periodIsWindowed = true;
        }
    }

    const ageDays = extractAgeDays(profileData);

    const scores = computeScores({
        xanaxTakenTotal: xanTakenTotal,
        xanaxTakenForPeriod: xanTakenForPeriod,
        ageDays,
        period,
    });

    const result = buildResult(
        normalizedId,
        profileData,
        scores,
        period,
        psForPeriod,
        counter,
        ageDays,
        xanTakenTotal,
        xanTakenLastMonth,
    );
    result.periodIsWindowed = periodIsWindowed;
    result.xanaxMode = xanaxMode;

    // Fetch names only if needed for this player
    result.factionName = result._factionId
        ? await fetchFactionName(result._factionId, apiKey, counter)
        : null;

    result.companyName = result._companyNameFromProfile ?? (result._companyId
        ? await fetchCompanyName(result._companyId, apiKey, counter)
        : null);

    delete result._factionId;
    delete result._companyId;
    delete result._companyNameFromProfile;

    result.tornApiCallsUsed = counter.value;
    return result;
}

module.exports = {
    getActiveRankedPlayerById,
};

