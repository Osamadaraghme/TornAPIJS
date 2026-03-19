/**
 * Service: random ACTIVE player with xanax-based tier (S/A/B/C/D).
 * Finds a player active in the last N hours, applies optional faction/company/tier filters,
 * computes score and tier, fetches faction/company names, returns result + API call count.
 *
 * API call minimization: we request profile + personalstats in a single user request
 * (one call per try instead of two when we need both). Faction/company names are only
 * fetched for the final chosen player.
 */

const { fetchUser, fetchFactionName, fetchCompanyName } = require('../api/torn-client.js');
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
const { computeScores, tierForFinalScore, isTierAtOrAbove, VALID_TIERS } = require('../utils/scoring.js');
const { messageForTornError, buildNoPlayerFoundError } = require('../utils/errors.js');
const { TORN_FATAL_ERROR_CODES, AVG_DAYS_PER_MONTH } = require('../constants.js');
const { randomIntInclusive } = require('../utils/helpers.js');

/**
 * Normalise and validate options; return a single options object.
 * @param {object} opts - Raw options (activeWithinHours, minId, maxId, maxTries, period, tier, hasFaction, hasCompany, minLevel)
 * @returns {object} Normalised options with defaults applied
 */
function parseOptions(opts) {
    return {
        activeWithinHours: Number.isFinite(opts.activeWithinHours) ? opts.activeWithinHours : 24,
        minId: Number.isFinite(opts.minId) ? opts.minId : 1,
        maxId: Number.isFinite(opts.maxId) ? opts.maxId : 3000000,
        maxTries: Number.isFinite(opts.maxTries) ? opts.maxTries : 60,
        period: opts.period === 'month' ? 'month' : 'day',
        desiredTier: (typeof opts.tier === 'string' ? opts.tier : 'ALL').toUpperCase(),
        factionFilter: (typeof opts.hasFaction === 'string' ? opts.hasFaction : 'ANY').toUpperCase(),
        companyFilter: (typeof opts.hasCompany === 'string' ? opts.hasCompany : 'ANY').toUpperCase(),
        minLevel: Number.isFinite(opts.minLevel) && opts.minLevel >= 0 ? opts.minLevel : null,
    };
}

/**
 * Check if this profile passes faction and company filters.
 */
function passesFactionCompanyFilters(profileData, factionFilter, companyFilter) {
    const hasFaction = hasFactionFromProfile(profileData);
    const hasCompany = hasCompanyFromProfile(profileData);
    if (factionFilter === 'Y' && !hasFaction) return false;
    if (factionFilter === 'N' && hasFaction) return false;
    if (companyFilter === 'Y' && !hasCompany) return false;
    if (companyFilter === 'N' && hasCompany) return false;
    return true;
}

/**
 * Build the success response object for one matched player.
 * @param {number} id - Player ID
 * @param {object} profileData - Normalised profile from API
 * @param {object} scores - Output from computeScores
 * @param {string} period - 'day' or 'month'
 * @param {object|null} ps - Personal stats object (or null)
 * @param {{ value: number }} counter - API call counter
 * @returns {object} Result shape; factionName/companyName filled by caller
 */
function buildResult(id, profileData, scores, period, ps, counter, ageDays, xanTakenTotal) {
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
        factionName: null, // filled below after async fetches
        companyName: companyNameFromProfile ?? null,
        hoursSinceLastAction: Number(hoursSinceLastAction.toFixed(2)),
        xanScore: Number(xanScorePct.toFixed(2)),
        tier,
        avgXanaxPerDay: scores.avgXanaxPerDay != null ? Number(scores.avgXanaxPerDay.toFixed(4)) : null,
        avgXanaxPerMonth: scores.avgXanaxPerMonth != null ? Number(scores.avgXanaxPerMonth.toFixed(2)) : null,
        allTimeXanaxTaken: xanTakenTotal != null ? Number(xanTakenTotal) : null,
        statsAvailable: Boolean(scores.statsAvailable) && Boolean(ps),
        periodUsed: period,
        tornApiCallsUsed: counter.value,
        _factionId: factionId,
        _companyId: companyId,
        _companyNameFromProfile: companyNameFromProfile,
    };
}

/**
 * Get a random active player in the last X hours, with optional tier/faction/company filters.
 * @param {string} apiKey - Torn API key
 * @param {object} [opts] - activeWithinHours, minId, maxId, maxTries, period, tier, hasFaction, hasCompany, minLevel
 * @returns {Promise<object>} Player result including tornApiCallsUsed
 */
async function getRandomActiveRankedPlayer(apiKey, opts = {}) {
    if (!apiKey) throw new Error('Torn API key is required.');
    const xanaxMode = String(process.env.TORN_XANAX_MODE || 'fast').toLowerCase() === 'probe' ? 'probe' : 'fast';

    const {
        activeWithinHours,
        minId,
        maxId,
        maxTries,
        period,
        desiredTier,
        factionFilter,
        companyFilter,
        minLevel,
    } = parseOptions(opts);

    const recencyBoostMax = Number.isFinite(Number(process.env.TORN_RECENCY_BOOST_MAX))
        ? Number(process.env.TORN_RECENCY_BOOST_MAX)
        : 4;

    const counter = { value: 0 };
    const runStats = { profilesOk: 0, activeCount: 0, passedFiltersCount: 0, lastTornError: null };

    const nowSeconds = Math.floor(Date.now() / 1000);
    const cutoff = nowSeconds - Math.floor(activeWithinHours * 3600);

    // Single request per try: profile + personalstats (saves 1 API call per run vs. separate calls)
    const USER_SELECTIONS = 'profile,personalstats';

    for (let i = 0; i < maxTries; i++) {
        const id = randomIntInclusive(minId, maxId);

        const personalStatsFrom = period === 'month'
            ? nowSeconds - Math.floor(AVG_DAYS_PER_MONTH * 86400)
            : nowSeconds - 86400;
        const personalStatsTo = nowSeconds;
        // Request windowed personalstats. (Torn web UI looks similar, but API supports unix `from/to`.)
        const personalStatsParams = {
            stats: 'useractivity',
            stat: 'xantaken',
            from: personalStatsFrom,
            to: personalStatsTo,
        };
        const data = await fetchUser(
            id,
            USER_SELECTIONS,
            apiKey,
            counter,
            personalStatsParams,
        );

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

        const ps = data?.personalstats != null
            ? (data.personalstats.personalstats ?? data.personalstats)
            : null;
        const xanTakenTotal = ps ? extractXanaxTaken(ps) : null;
        const xanTakenForPeriod = ps ? extractXanaxTakenForPeriod(ps, period) : null;
        const ageDays = extractAgeDays(profileData);

        // If Torn doesn't expose true windowed xanax totals for month scoring,
        // we can't match "last month" exactly. In fast mode we apply a
        // recency-based multiplier to lifetime avg/day so recruitment results
        // are more responsive without extra API calls.
        let avgXanaxPerDayMultiplier = 1;
        if (xanaxMode === 'fast'
            && period === 'month'
            && xanTakenForPeriod == null
            && Number.isFinite(activeWithinHours)
            && activeWithinHours > 0) {
            const hoursSinceLastAction = (nowSeconds - lastActionTs) / 3600;
            const recencyT = 1 - (hoursSinceLastAction / activeWithinHours);
            const t = Math.max(0, Math.min(1, recencyT));
            avgXanaxPerDayMultiplier = 1 + recencyBoostMax * t;
        }

        const scores = computeScores({
            xanaxTakenTotal: xanTakenTotal,
            xanaxTakenForPeriod: xanTakenForPeriod,
            ageDays,
            period,
            avgXanaxPerDayMultiplier,
        });

        const xanScorePct = scores.xanScore * 100;
        const finalScorePct = scores.finalScore * 100;
        const tier = tierForFinalScore(finalScorePct);

        if (VALID_TIERS.includes(desiredTier) && !isTierAtOrAbove(tier, desiredTier)) {
            continue;
        }

        const result = buildResult(id, profileData, scores, period, ps, counter, ageDays, xanTakenTotal);
        result.periodIsWindowed = xanTakenForPeriod != null;
        result.xanaxMode = xanaxMode;

        // Fetch names only for the chosen player
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

    throw buildNoPlayerFoundError(runStats, { maxTries, activeWithinHours, desiredTier }, counter);
}

module.exports = {
    getRandomActiveRankedPlayer,
};

