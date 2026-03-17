/**
 * Torn City API – random ACTIVE player + scoring (S/A/B/C/D)
 *
 * Finds a random player who has been active within the last N hours (default 24),
 * then computes:
 *   XanScore = min((avg xanax per day)/4, 1) * 100
 *
 * Optional: period="month" uses equivalent monthly caps:
 *   4 xan/day  ~= 121.75 xan/month  (30.4375 days/month)
 *
 * Note: Torn does not provide a dedicated "random player" endpoint; this probes random IDs.
 * Note: Some `personalstats` may be inaccessible for other players depending on API rules.
 */

const API_BASE = 'https://api.torn.com';
const AVG_DAYS_PER_MONTH = 30.4375;

function randomIntInclusive(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function extractLastActionTimestampSeconds(profileData) {
    const la = profileData?.last_action;
    if (typeof la === 'number') return la;
    if (typeof la?.timestamp === 'number') return la.timestamp;
    if (typeof la?.time === 'number') return la.time;
    if (typeof la?.unix === 'number') return la.unix;
    return null;
}

function extractLevel(data) {
    const level = data?.level ?? data?.profile?.level ?? null;
    return level != null ? Number(level) : null;
}

function extractName(data) {
    const name = data?.name ?? data?.profile?.name ?? null;
    return typeof name === 'string' ? name : null;
}

function extractAgeDays(profileData) {
    const age = profileData?.age ?? null;
    return age != null ? Number(age) : null;
}

function hasFactionFromProfile(profileData) {
    const p = profileData?.profile ?? profileData;
    const fid = p?.faction_id ?? p?.faction?.faction_id ?? p?.faction?.ID ?? null;
    if (fid != null && Number(fid) > 0) return true;
    const f = p?.faction;
    return Boolean(f && typeof f === 'object' && Object.keys(f).length > 0);
}

function hasCompanyFromProfile(profileData) {
    const p = profileData?.profile ?? profileData;
    const cid = p?.company_id ?? p?.job?.company_id ?? p?.job?.company ?? null;
    if (cid != null && Number(cid) > 0) return true;
    const j = p?.job;
    return Boolean(j && typeof j === 'object' && Object.keys(j).length > 0);
}

function extractFactionId(profileData) {
    const p = profileData?.profile ?? profileData;
    const fid = p?.faction_id ?? p?.faction?.faction_id ?? p?.faction?.ID ?? null;
    return fid != null && Number(fid) > 0 ? Number(fid) : null;
}

function extractCompanyId(profileData) {
    const p = profileData?.profile ?? profileData;
    const cid = p?.company_id ?? p?.job?.company_id ?? p?.job?.company ?? null;
    return cid != null && Number(cid) > 0 ? Number(cid) : null;
}

async function fetchFactionName(factionId, apiKey) {
    try {
        const url = `${API_BASE}/faction/${factionId}?selections=basic&key=${apiKey}`;
        const res = await fetch(url);
        const data = await res.json();
        if (data?.error) return null;
        const name = data?.name ?? data?.basic?.name ?? null;
        return typeof name === 'string' ? name : null;
    } catch {
        return null;
    }
}

async function fetchCompanyName(companyId, apiKey) {
    try {
        const url = `${API_BASE}/company/${companyId}?selections=profile&key=${apiKey}`;
        const res = await fetch(url);
        const data = await res.json();
        if (data?.error) return null;
        const name = data?.name ?? data?.profile?.name ?? data?.company_name ?? null;
        return typeof name === 'string' ? name : null;
    } catch {
        return null;
    }
}

function extractXanaxTaken(personalstatsData) {
    // common field name is usually xantaken; keep fallbacks for safety
    const v = personalstatsData?.xantaken ?? personalstatsData?.xanax_taken ?? personalstatsData?.xanaxTaken ?? null;
    return v != null ? Number(v) : null;
}

function clamp01(x) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    return x;
}

function computeScores({ xanaxTakenTotal, ageDays, period }) {
    const safeAgeDays = Number.isFinite(ageDays) && ageDays > 0 ? ageDays : null;
    if (!safeAgeDays) {
        return {
            xanScore: 0,
            finalScore: 0,
            periodUsed: period,
            avgXanaxPerDay: null,
            avgXanaxPerMonth: null,
            statsAvailable: false
        };
    }

    const avgXanPerDay = Number.isFinite(xanaxTakenTotal) ? (xanaxTakenTotal / safeAgeDays) : null;

    const usingMonth = period === 'month';
    const xanDenom = usingMonth ? (4 * AVG_DAYS_PER_MONTH) : 4;

    const avgXanPeriod = avgXanPerDay == null ? null : (usingMonth ? (avgXanPerDay * AVG_DAYS_PER_MONTH) : avgXanPerDay);

    // Always provide both per-day and per-month averages for convenience.
    const avgXanPerMonth = avgXanPerDay == null ? null : avgXanPerDay * AVG_DAYS_PER_MONTH;

    // Keep scores in 0–1 range here; we'll scale to 0–100 when returning to caller.
    const xanScore = avgXanPeriod == null ? 0 : clamp01(avgXanPeriod / xanDenom);
    const finalScore = xanScore;

    const statsAvailable = avgXanPeriod != null;

    return {
        xanScore,
        finalScore,
        periodUsed: period,
        avgXanaxPerDay: avgXanPerDay,
        avgXanaxPerMonth: avgXanPerMonth,
        statsAvailable
    };
}

function tierForFinalScore(finalScore0to100) {
    if (finalScore0to100 >= 90) return 'S';
    if (finalScore0to100 >= 75) return 'A';
    if (finalScore0to100 >= 60) return 'B';
    if (finalScore0to100 >= 40) return 'C';
    return 'D';
}

async function fetchUser(id, selections, apiKey) {
    const url = `${API_BASE}/user/${id}?selections=${encodeURIComponent(selections)}&key=${apiKey}`;
    const res = await fetch(url);
    return res.json();
}

/**
 * Get a random player active in the last X hours, score them, and optionally filter by tier.
 *
 * @param {string} apiKey Torn API key
 * @param {object} [opts]
 * @param {number} [opts.activeWithinHours=24]
 * @param {number} [opts.minId=1]
 * @param {number} [opts.maxId=3000000]
 * @param {number} [opts.maxTries=60]
 * @param {"day"|"month"} [opts.period="day"]
 * @param {"S"|"A"|"B"|"C"|"D"|"ALL"} [opts.tier="ALL"] Desired tier filter (case-insensitive). "ALL" ignores tier.
 * @param {"Y"|"N"|"ANY"} [opts.hasFaction="ANY"] Filter by having a faction (Y), being factionless (N), or ignore (ANY).
 * @param {"Y"|"N"|"ANY"} [opts.hasCompany="ANY"] Filter by having a company/job (Y), not having one (N), or ignore (ANY).
 * @returns {Promise<{playerId:number,name:string|null,level:number|null,hasFaction:boolean,hasCompany:boolean,factionName:string|null,companyName:string|null,hoursSinceLastAction:number,xanScore:number,tier:"S"|"A"|"B"|"C"|"D",statsAvailable:boolean,periodUsed:"day"|"month"}>}
 */
async function getRandomActiveRankedPlayer(apiKey, opts = {}) {
    if (!apiKey) throw new Error('Torn API key is required');

    const activeWithinHours = Number.isFinite(opts.activeWithinHours) ? opts.activeWithinHours : 24;
    const minId = Number.isFinite(opts.minId) ? opts.minId : 1;
    const maxId = Number.isFinite(opts.maxId) ? opts.maxId : 3000000;
    const maxTries = Number.isFinite(opts.maxTries) ? opts.maxTries : 60;
    const period = opts.period === 'month' ? 'month' : 'day';
    const desiredTierRaw = typeof opts.tier === 'string' ? opts.tier : 'ALL';
    const desiredTier = desiredTierRaw.toUpperCase();
    const factionFilterRaw = typeof opts.hasFaction === 'string' ? opts.hasFaction : 'ANY';
    const companyFilterRaw = typeof opts.hasCompany === 'string' ? opts.hasCompany : 'ANY';
    const factionFilter = factionFilterRaw.toUpperCase();
    const companyFilter = companyFilterRaw.toUpperCase();

    const nowSeconds = Math.floor(Date.now() / 1000);
    const cutoff = nowSeconds - Math.floor(activeWithinHours * 3600);

    for (let i = 0; i < maxTries; i++) {
        const id = randomIntInclusive(minId, maxId);

        const profileData = await fetchUser(id, 'profile', apiKey);
        if (profileData?.error) continue;

        const lastActionTs = extractLastActionTimestampSeconds(profileData);
        if (!lastActionTs || lastActionTs < cutoff) continue;

        const name = extractName(profileData);
        const level = extractLevel(profileData);
        const ageDays = extractAgeDays(profileData);

        const hasFaction = hasFactionFromProfile(profileData);
        const hasCompany = hasCompanyFromProfile(profileData);

        if (factionFilter === 'Y' && !hasFaction) continue;
        if (factionFilter === 'N' && hasFaction) continue;

        if (companyFilter === 'Y' && !hasCompany) continue;
        if (companyFilter === 'N' && hasCompany) continue;

        let personalstatsData = null;
        try {
            personalstatsData = await fetchUser(id, 'personalstats', apiKey);
        } catch {
            personalstatsData = null;
        }

        // API usually returns { personalstats: { ... } } – unwrap that if present.
        const ps = personalstatsData && !personalstatsData.error
            ? (personalstatsData.personalstats || personalstatsData)
            : null;

        // If personalstats isn't accessible, we still return tier D with 0 scores (explicitly flagged).
        const xanTaken = ps ? extractXanaxTaken(ps) : null;

        const scores = computeScores({
            xanaxTakenTotal: xanTaken,
            ageDays,
            period
        });

        // Convert internal 0–1 scores to 0–100 for output & tiering.
        const xanScorePct = scores.xanScore * 100;
        const finalScorePct = scores.finalScore * 100;

        const tier = tierForFinalScore(finalScorePct);

        // If a specific tier is requested (not ALL) and this player doesn't match, keep searching.
        if (['S', 'A', 'B', 'C', 'D'].includes(desiredTier) && tier !== desiredTier) {
            continue;
        }

        const hoursSinceLastAction = (nowSeconds - lastActionTs) / 3600;

        const factionId = extractFactionId(profileData);
        const companyId = extractCompanyId(profileData);
        const factionName = factionId ? await fetchFactionName(factionId, apiKey) : null;
        const companyName = companyId ? await fetchCompanyName(companyId, apiKey) : null;

        return {
            playerId: Number(id),
            name,
            level,
            hasFaction,
            hasCompany,
            factionName,
            companyName,
            hoursSinceLastAction: Number(hoursSinceLastAction.toFixed(2)),
            xanScore: Number(xanScorePct.toFixed(2)),
            tier,
            avgXanaxPerDay: scores.avgXanaxPerDay != null ? Number(scores.avgXanaxPerDay.toFixed(4)) : null,
            avgXanaxPerMonth: scores.avgXanaxPerMonth != null ? Number(scores.avgXanaxPerMonth.toFixed(2)) : null,
            statsAvailable: Boolean(scores.statsAvailable) && Boolean(ps),
            periodUsed: period
        };
    }

    throw new Error(`Could not find an active player (last ${activeWithinHours}h) after ${maxTries} tries. Try increasing maxTries or adjusting maxId.`);
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getRandomActiveRankedPlayer };
}

