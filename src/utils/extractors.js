/**
 * Extract fields from Torn API responses.
 * API response shape can vary (top-level vs nested under "profile"), so we normalise here.
 */

/**
 * Last action timestamp (seconds since epoch). Handles multiple response shapes.
 * @param {object} profileData - User profile response (or full response with profile nested)
 * @returns {number|null}
 */
function extractLastActionTimestampSeconds(profileData) {
    const p = profileData?.profile ?? profileData;
    const la = p?.last_action;
    if (typeof la === 'number') return la;
    if (typeof la === 'string' && la.trim() !== '') {
        const n = Number(la);
        if (Number.isFinite(n)) return n;
    }

    // Some Torn responses wrap last_action in an object with multiple numeric fields.
    if (typeof la?.timestamp === 'number') return la.timestamp;
    if (typeof la?.timestamp === 'string' && la.timestamp.trim() !== '') {
        const n = Number(la.timestamp);
        if (Number.isFinite(n)) return n;
    }
    if (typeof la?.time === 'number') return la.time;
    if (typeof la?.time === 'string' && la.time.trim() !== '') {
        const n = Number(la.time);
        if (Number.isFinite(n)) return n;
    }
    if (typeof la?.unix === 'number') return la.unix;
    if (typeof la?.unix === 'string' && la.unix.trim() !== '') {
        const n = Number(la.unix);
        if (Number.isFinite(n)) return n;
    }
    return null;
}

/** @param {object} data - User or profile object */
function extractLevel(data) {
    const level = data?.level ?? data?.profile?.level ?? null;
    return level != null ? Number(level) : null;
}

/** @param {object} data - User or profile object */
function extractName(data) {
    const name = data?.name ?? data?.profile?.name ?? null;
    return typeof name === 'string' ? name : null;
}

/** @param {object} profileData - User profile (or full response with profile nested) */
function extractAgeDays(profileData) {
    const p = profileData?.profile ?? profileData;
    const age = p?.age ?? null;
    return age != null ? Number(age) : null;
}

/** Whether the user has a faction (ID or nested object). */
function hasFactionFromProfile(profileData) {
    // Keep this consistent with `extractFactionId()` so `hasFaction` matches
    // whether Torn actually provides a valid faction ID.
    return extractFactionId(profileData) != null;
}

/** Whether the user has a company/job. */
function hasCompanyFromProfile(profileData) {
    // Keep this consistent with `extractCompanyId()` so `hasCompany` matches
    // whether Torn actually provides a valid company ID.
    return extractCompanyId(profileData) != null;
}

/** @returns {number|null} Faction ID or null */
function extractFactionId(profileData) {
    const p = profileData?.profile ?? profileData;
    const fid = p?.faction_id ?? p?.faction?.faction_id ?? p?.faction?.ID ?? null;
    return fid != null && Number(fid) > 0 ? Number(fid) : null;
}

/** @returns {number|null} Company ID or null */
function extractCompanyId(profileData) {
    const p = profileData?.profile ?? profileData;
    const cid = p?.company_id ?? p?.job?.company_id ?? p?.job?.company ?? null;
    return cid != null && Number(cid) > 0 ? Number(cid) : null;
}

/**
 * Company name from user profile/job if present (avoids extra company API call).
 * @returns {string|null}
 */
function extractCompanyNameFromProfile(profileData) {
    const job = profileData?.job ?? profileData?.profile?.job ?? null;
    if (job && typeof job === 'string' && job.length > 0) return job;
    if (!job || typeof job !== 'object') return null;
    const name = job.company_name ?? job.company_name_short ?? job.company ?? job.name ?? job.position ?? job.job_title ?? job.title ?? null;
    return typeof name === 'string' && name.length > 0 ? name : null;
}

/** Total xanax taken from personalstats (lifetime). Handles different field names. */
function extractXanaxTaken(personalstatsData) {
    const v = personalstatsData?.xantaken ?? personalstatsData?.xanax_taken ?? personalstatsData?.xanaxTaken ?? null;
    return v != null ? Number(v) : null;
}

/**
 * Try to extract xanax intake within the requested window from Torn `personalstats`.
 *
 * Notes:
 * - Torn does not clearly document (in this repo) a guaranteed "last 30 days" xanax field.
 * - This function uses best-effort key matching for month/day window fields when present.
 * - If nothing window-based is found, returns null so scoring can fall back to lifetime averages.
 *
 * @param {object} personalstatsData
 * @param {'day'|'month'} period
 * @returns {number|null} window xanax taken total (if available publicly), else null
 */
function extractXanaxTakenForPeriod(personalstatsData, period) {
    if (!personalstatsData || typeof personalstatsData !== 'object') return null;

    const keys = Object.keys(personalstatsData);
    if (!keys.length) return null;

    const lowerPeriod = String(period || '').toLowerCase();
    const isMonth = lowerPeriod === 'month';
    const isDay = lowerPeriod === 'day';

    const isXanKey = (k) => /xantaken|xanax[_-]?taken|xanax/i.test(String(k).toLowerCase());
    const asNum = (v) => {
        if (v == null) return null;
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
    };

    // If Torn already applied the `from=1 month` / `from=1 day` window,
    // some API responses may include window totals under a key that
    // contains "30"/"month"/"last month"/etc. This extractor tries to
    // identify those keys.
    const lifetimeTotal = extractXanaxTaken(personalstatsData);

    // Prefer explicit window fields when available.
    if (isMonth) {
        const monthCandidates = keys
            .filter((k) => isXanKey(k))
            .filter((k) => {
                const lk = String(k).toLowerCase();
                // month-like indicators (30-day / last month / 1m)
                return /(30|last_?30|last30|month|last_?month|lastmonth|1m|1\s*m|1month|last30d|30d)/.test(lk);
            });

        if (monthCandidates.length) {
            const scored = monthCandidates
                .map((k) => ({ k, n: asNum(personalstatsData[k]) }))
                .filter((x) => x.n != null);

            const filtered = lifetimeTotal != null
                ? scored.filter((x) => x.n <= lifetimeTotal)
                : scored;

            if (filtered.length) {
                filtered.sort((a, b) => b.n - a.n);
                return filtered[0].n;
            }
        }

        // API returned only lifetime key (e.g. xantaken). Do not treat it as window data.
        return null;
    }

    if (isDay) {
        const dayCandidates = keys
            .filter((k) => isXanKey(k))
            .filter((k) => {
                const lk = String(k).toLowerCase();
                // 1-day / 24h / daily-like indicators
                return /(1d|24h|day|daily|today|last_?day|lastday|24\s*h|24hr)/.test(lk);
            });

        if (dayCandidates.length) {
            const scored = dayCandidates
                .map((k) => ({ k, n: asNum(personalstatsData[k]) }))
                .filter((x) => x.n != null);

            const filtered = lifetimeTotal != null
                ? scored.filter((x) => x.n <= lifetimeTotal)
                : scored;

            if (filtered.length) {
                filtered.sort((a, b) => b.n - a.n);
                return filtered[0].n;
            }
        }

        // API returned only lifetime key; do not treat it as window data.
        return null;
    }

    return null;
}

// @ts-ignore: project uses CommonJS (`require`/`module.exports`) for runtime compatibility.
module.exports = {
    extractLastActionTimestampSeconds,
    extractLevel,
    extractName,
    extractAgeDays,
    hasFactionFromProfile,
    hasCompanyFromProfile,
    extractFactionId,
    extractCompanyId,
    extractCompanyNameFromProfile,
    extractXanaxTaken,
    extractXanaxTakenForPeriod,
};
